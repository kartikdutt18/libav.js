if (typeof process !== "undefined") {
  // Node.js
  LibAV = require("../libav-5.0-mp4-aac.js");
  fs = require("fs");
  OpusExa = Function(
    fs.readFileSync("exa.opus.js", "utf8") + "return OpusExa;"
  )();
}

function makeCodecOpts(frame, libav) {
  return {
            ctx: {
                bit_rate: 128000,
                sample_fmt: libav.AV_SAMPLE_FMT_FLT,
                sample_rate: 48000,
                channel_layout: 4,
                channels: 1
            },
            time_base: [1, 48000]
        };
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
    timebase: { num: 1, den: 48000}
  };
}

async function RunExampleToTranscodeMp4(libav) {


  // Init encoder
  const encoder = await libav.ff_init_encoder("aac", {
            ctx: {
                bit_rate: 128000,
                sample_fmt: libav.AV_SAMPLE_FMT_FLT,
                sample_rate: 48000,
                channel_layout: 4,
                channels: 1
            },
            time_base: [1, 48000]
        });
  const encoderAVCodecContext = encoder[1];
  const encoderFramePointer = encoder[2];
  const encoderPacketHandler = encoder[3];

  const muxR = await libav.ff_init_muxer({filename: "tmp.mp4", open: true}, [[encoderAVCodecContext, 1, 48000]]);
  const destinationContext = muxR[0];
  const pb = muxR[2];

  await libav.avformat_write_header(destinationContext, 0);
  const audioEncoderData = await decodeAudio(libav);
  let packets = await libav.ff_encode_multi(
    encoderAVCodecContext,
    encoderFramePointer,
    encoderPacketHandler,
    audioEncoderData.frames,
    true
  );

  // for (const p of packets) {
  //     p.stream_index = 0;
  //     // To Do: Figure out pts logic for safari as it will export without audio if pts aren't correct.
  // }

  await libav.ff_write_multi(
    destinationContext,
    encoderPacketHandler,
    packets,
  );
  // await libav.ff_write_multi(destinationContext, encoderPacketHandler, [], true);
  // await libav.ff_free_encoder(
  //   encoderAVCodecContext,
  //   encoderFramePointer,
  //   encoderPacketHandler
  // );

  // Export to file.
 libav.av_write_trailer(destinationContext);
  await libav.ff_free_muxer(destinationContext, pb);
  const file = await libav.readFile("tmp.mp4");
  const blob = new Blob([file.buffer], { type: "video/mp4" });
    const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "a.mp4";
  a.click();
}

function main() {
  LibAV.LibAV().then(async function (libav) {
    return await RunExampleToTranscodeMp4(libav);
  });
}

main();
