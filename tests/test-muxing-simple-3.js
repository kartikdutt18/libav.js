if (typeof process !== "undefined") {
    // Node.js
    LibAV = require("../libav-3.7.5.0.1-default.js");
    fs = require("fs");
}

function print(txt) {
    if (typeof document !== "undefined") {
        var out = document.createElement("pre");
        out.innerText = txt;
        document.body.appendChild(out);
    } else {
        console.log(txt);
    }
}

async function readFile(libav, audio_stream_idx, formatCtx, pkt) {
  const packets = [];
  for (;;) {
    const ret = await libav.ff_read_multi(formatCtx, pkt, undefined, {
      limit: 100,
    });
    if (ret[1][audio_stream_idx] !== undefined) {
      for (const p of ret[1][audio_stream_idx]) {
        packets.push(p);
      }
    }

    if (ret[0] === libav.AVERROR_EOF) {
      break;
    }
  }
  return packets;
}

async function decodeAudio(libav) {
  const response = await fetch(
    "https://osizewuspersimmon001.blob.core.windows.net/audios/publish/e4d72f8e-cb51-4784-b728-9b9b2ce72c24/fun_Block_Party_MSFT_MSTR_64.aac"
  );
  const data = new Uint8Array(await response.arrayBuffer());
  const filename = `AudioPlayer0.aac`;
  const uint8array = new Uint8Array(data);
  await libav.writeFile(filename, uint8array);
  // await libav.mkreadaheadfile(filename, new Uint8Array(data));
  const readDemuxer = await libav.ff_init_demuxer_file(filename);
  const formatCtx = readDemuxer[0];
  let audioStream;
  for (const s of readDemuxer[1] /* readDemuxer = [cntx, streams] */) {
    if (s.codec_type === libav.AVMEDIA_TYPE_AUDIO) {
      audioStream = s;
      break;
    }
  }

  // await libav.AVStream_duration_s(, 83)
  if (audioStream === undefined) {
    // No audio to add.
    throw new Error("No audio stream");
  }

  const rDecoder = await libav.ff_init_decoder(
    audioStream.codec_id,
    audioStream.codecpar,
    
  );
  const c = rDecoder[1];
  const pkt = rDecoder[2];
  const frame = rDecoder[3];

  const packets = await libav.ff_read_multi(formatCtx, pkt);
  const frames = await libav.ff_decode_multi(c, pkt, frame, packets[1][audioStream.index], true);
  return {
    frames,
    c,
    pkt,
    frame,
    formatCtx,
    timebase: { num: audioStream.time_base_num, den: audioStream.time_base_den}
  };
}

/* This is a port of doc/examples/muxing.c, simplified */
function main() {
    var libav;
    var oc, fmt, codec, c, frame, pkt, st, pb, frame_size;

    LibAV.LibAV().then(ret => {
      libav = ret;
      return new Promise(function(res, rej) {
            if (typeof XMLHttpRequest !== "undefined") {
                var xhr = new XMLHttpRequest();
                xhr.responseType = "arraybuffer";
                xhr.open("GET", "aa.mp4", true);

                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 200)
                            res(xhr.response);
                        else
                            rej(xhr.status);
                    }
                };

                xhr.send();

            } else {
                res(fs.readFileSync("exa.mp4").buffer);
            }

        });
    }).then(async function(video) {
       await libav.writeFile("tmp1.mp4", new Uint8Array(video));
       const H264_demux = await libav.ff_init_demuxer_file("tmp1.mp4");
       const H264_fmt_ctx = H264_demux[0];
       const H264_streams = H264_demux[1];

        var H264_si, H264_stream;
        for (H264_si = 0; H264_si < H264_streams.length; H264_si++) {
            H264_stream = H264_streams[H264_si];
            if (H264_stream.codec_type === libav.AVMEDIA_TYPE_VIDEO)
                break;
        }
        if (H264_si >= H264_streams.length)
            throw new Error("Couldn't find video stream");

        video_stream_idx = H264_stream.index;
        const H264_decoder = await libav.ff_init_decoder(H264_stream.codec_id, H264_stream.codecpar);
        const H264_Decode_c = H264_decoder[1];
        const H264_Decode_pkt = H264_decoder[2];
        const H264_Decode_frame = H264_decoder[3];
        const vidframes = await libav.ff_read_multi(H264_fmt_ctx, H264_Decode_pkt);
        const videoFrames = await libav.ff_decode_multi(H264_Decode_c, H264_Decode_pkt, H264_Decode_frame, vidframes[1][video_stream_idx], true);

       const openh264Encoder = await libav.ff_init_encoder("libopenh264", {
            ctx: {
                bit_rate: 1000000,
                pix_fmt: videoFrames[0].format,
                width: videoFrames[0].width,
                height: videoFrames[0].height
            },
            options: {
               quality: "realtime",
            }
        });

        
        let H264_codec = openh264Encoder[0];
        let H264_c = openh264Encoder[1];
        let H264_frame = openh264Encoder[2];
        let H264_pkt = openh264Encoder[3];

       const initEncoder = await libav.ff_init_encoder("aac", {
            ctx: {
                bit_rate: 66000,
                sample_fmt: libav.AV_SAMPLE_FMT_FLT,
                sample_rate: 48000,
                channel_layout: 4,
                channels: 1
            },
            time_base: [1, 48000]
        });
        codec = initEncoder[0];
        c = initEncoder[1];
        frame = initEncoder[2];
        pkt = initEncoder[3];
        frame_size = initEncoder[4];
        console.log(videoFrames);

       const ret = await libav.ff_init_muxer({filename: "tmp.mp4", open: true}, [ [H264_c, 1, 12000],  [c, 1, 48000]]);

        oc = ret[0];
        fmt = ret[1];
        pb = ret[2];
        st = ret[3][0];
        console.log(ret, st);
        await libav.avformat_write_header(oc, 0);
        const decodeAudop = await decodeAudio(libav);

        const packets = await libav.ff_encode_multi(c, frame, pkt, decodeAudop.frames.slice(0, Math.floor(decodeAudop.frames.length / 18)), true);
        const videoPackets = await libav.ff_encode_multi(H264_c, H264_frame, H264_pkt, videoFrames, true);
        for (const packet of packets) {
          packet.stream_index = 1;
        }

        await libav.ff_write_multi(oc, H264_pkt, videoPackets, true);
        await libav.ff_write_multi(oc, pkt, packets, true);
        await libav.av_write_trailer(oc);
        await libav.ff_free_muxer(oc, pb);
        await libav.ff_free_encoder(c, frame, pkt);
        const finFile = await libav.readFile("tmp.mp4");
        if (typeof document !== "undefined") {
            var blob = new Blob([finFile.buffer], { type: "video/mp4" });
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.innerText = "mp4";
            document.body.appendChild(a);
        } else {
            fs.writeFileSync("out.aac", finFile);
        }
        print("Done");
    }).catch(function(err) {
        print(err + "");
    });
}

main();
