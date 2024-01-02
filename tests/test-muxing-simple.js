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
  await libav.writeFile(filename, new Uint8Array(data));
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
  // await libav.AVPacket_duration_s(pkt, 83);
  const packets = await readFile(libav, audioStream.index, formatCtx, pkt);
  const frames = await libav.ff_decode_multi(c, pkt, frame, packets, true);
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

    LibAV.LibAV().then(async function(libavTemp) {
      libav = libavTemp;
       const initEncoder = await libav.ff_init_encoder("aac", {
            ctx: {
                bit_rate: 128000,
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
       const ret = await libav.ff_init_muxer({filename: "tmp.mp4", open: true}, [[c, 1, 48000]]);
        oc = ret[0];
        fmt = ret[1];
        pb = ret[2];
        st = ret[3][0];
        console.log(ret, st);
        await libav.avformat_write_header(oc, 0);
        const decodeAudop = await decodeAudio(libav)
        const packets = await libav.ff_encode_multi(c, frame, pkt, decodeAudop.frames, true);
        await libav.ff_write_multi(oc, pkt, packets);
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
