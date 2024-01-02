if (typeof process !== "undefined") {
  // Node.js
  LibAV = require("../libav-5.0-mp4-aac.js");
  fs = require("fs");
  OpusExa = Function(
    fs.readFileSync("exa.opus.js", "utf8") + "return OpusExa;"
  )();
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

  const ret = await libav.ff_read_stream(formatCtx, audioStream);
  return {
    formatCtx,
    srcPktHandle: ret.pkt,
    ssti: audioStream.index,
    audioStream: audioStream,
  };
}

async function RunExampleToTranscodeMp4(libav) {
  // Decode audio
  const audioEncoderData = await decodeAudio(libav);

  const filename = "abc.mp4";
  const muxR = await libav.ff_init_muxer(
    { filename: filename, open: true },
    []
    // [encoderAVCodecContext, audioEncoderData.timebase.num, audioEncoderData.timebase.den]
  );

  const destinationContext = muxR[0];
  const pb = muxR[2];
  const retCL = await libav.ff_copy_stream(
    destinationContext,
    audioEncoderData.audioStream
  );
  const dsti = retCL[0];
  const destPktHandle = retCL[1];
  const ret = await libav.ff_read_multi(
    audioEncoderData.formatCtx,
    audioEncoderData.srcPktHandle
  );
  let pkts = ret[1][audioEncoderData.ssti];

  await libav.avformat_write_header(destinationContext, 0);

  for (const p of pkts) {
    p.stream_index = dsti;
    // To Do: Figure out pts logic for safari as it will export without audio if pts aren't correct.
  }

  await libav.ff_write_multi(destinationContext, destPktHandle, pkts, true);
  await libav.ff_write_multi(destinationContext, destPktHandle, [], true);

  console.log("HERE");
  // Export to file.
  // await libav.av_write_trailer(destinationContext);
  await libav.ff_free_muxer(destinationContext, pb);
  const file = await libav.readFile(filename);
  const blob = new Blob([file.buffer], { type: "video/mp4" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "a.mp4";
  a.click();
}

function main() {
  LibAV.LibAV().then(async function (libav) {
    libav.ff_add_stream = async function (
      oc,
      codecparms,
      time_base_num,
      time_base_den
    ) {
      const st = await libav.avformat_new_stream(oc, 0);
      if (st === 0) throw new Error("Could not allocate stream");
      const codecpar = await libav.AVStream_codecpar(st);
      await libav.AVStream_time_base_s(st, time_base_num, time_base_den);
      const ret = await libav.avcodec_parameters_from_context(
        codecpar,
        codecparms
      );
      if (ret < 0)
        throw new Error(
          "Could not copy the stream parameters: " + libav.ff_error(ret)
        );
      await libav.AVStream_time_base_s(st, time_base_num, time_base_den);
      const pkt = await libav.av_packet_alloc();
      if (pkt === 0) throw new Error("Could not allocate packet");
      const sti = (await libav.AVFormatContext_nb_streams(oc)) - 1;
      return [sti, pkt];
    };
    libav.ff_get_codecpar = function (src) {
      const sz = libav.AVCodecParameters_extradata_size(src);
      const p = libav.AVCodecParameters_extradata(src);
      const description = libav.copyout_u8(p, sz);
      const codedWidth = libav.AVCodecParameters_width(src);
      const codedHeight = libav.AVCodecParameters_width(src);
      return {
        description,
        codedWidth,
        codedHeight,
      };
    };
    libav.ff_copy_stream = async function (oc, stream) {
      const st = await libav.avformat_new_stream(oc, 0);
      if (st === 0) throw new Error("Could not allocate stream");
      const codecpar = await libav.AVStream_codecpar(st);
      const ret = await libav.avcodec_parameters_from_context(codecpar, stream.codecpar);
      if (ret < 0)
        throw new Error(
          "Could not copy the stream parameters: " + libav.ff_error(ret)
        );
      await libav.AVStream_time_base_s(
        st,
        stream.time_base_num,
        stream.time_base_den
      );
      const pkt = await libav.av_packet_alloc();
      if (pkt === 0) throw new Error("Could not allocate packet");
      const sti = await libav.AVFormatContext_nb_streams(oc) - 1;
      return [sti, pkt];
    };

    libav.ff_read_stream = async function (_, stream) {
      const config = await libav.ff_get_codecpar(stream.codecpar);
      const pkt = await libav.av_packet_alloc();
      if (pkt === 0) throw new Error("Could not allocate packet");
      return { config, pkt };
    };

    libav.ff_get_codecpar = async function (src) {
      const sz = await libav.AVCodecParameters_extradata_size(src);
      const p = await libav.AVCodecParameters_extradata(src);
      const description = await libav.copyout_u8(p, sz);
      const codedWidth = await libav.AVCodecParameters_width(src);
      const codedHeight = await libav.AVCodecParameters_width(src);
      return {
        description,
        codedWidth,
        codedHeight,
      };
    };
    return await RunExampleToTranscodeMp4(libav);
  });
}

main();
