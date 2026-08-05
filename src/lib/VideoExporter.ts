import * as Muxer from 'mp4-muxer';

export class VideoExporter {
  private canvas: HTMLCanvasElement;
  private renderFrame: (timeMs: number) => void;
  private audioBuffer: ArrayBuffer;
  private duration: number;
  private fps = 30;
  private aborted = false;

  constructor(canvas: HTMLCanvasElement, renderFrame: (timeMs: number) => void, audioBuffer: ArrayBuffer, duration: number) {
    this.canvas = canvas;
    this.renderFrame = renderFrame;
    this.audioBuffer = audioBuffer;
    this.duration = duration;
  }

  async stop() {
    this.aborted = true;
  }

  async export(onProgress: (progress: number) => void): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
      try {
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Candidate video codecs: AVC/H.264 profiles for wide Android/Windows/iOS compatibility, followed by VP9 & HEVC
        const codecsToTry = [
          'avc1.640028', // High Profile Level 4.0 (1080p)
          'avc1.4d0028', // Main Profile Level 4.0
          'avc1.420028', // Baseline Profile Level 4.0
          'avc1.42E01E', // Baseline Level 3.0
          'vp09.00.10.08', // VP9 Profile 0
          'hvc1.1.6.L93.B0' // HEVC Main Profile
        ];

        let selectedCodec = codecsToTry[0];
        let codecSupported = false;

        for (const codec of codecsToTry) {
          try {
            const config = {
              codec,
              width,
              height,
              bitrate: 5_000_000,
              framerate: this.fps
            };
            const support = await VideoEncoder.isConfigSupported(config as any);
            if (support.supported) {
              selectedCodec = codec;
              codecSupported = true;
              break;
            }
          } catch (e) {
            // Ignore unsupported codec check error
          }
        }

        if (!codecSupported) {
          throw new Error("UNSUPPORTED_CODEC");
        }

        let muxerVideoCodec: 'avc' | 'hevc' | 'vp9' = 'avc';
        if (selectedCodec.startsWith('hvc') || selectedCodec.startsWith('hev')) {
          muxerVideoCodec = 'hevc';
        } else if (selectedCodec.startsWith('vp09') || selectedCodec.startsWith('vp9')) {
          muxerVideoCodec = 'vp9';
        }

        let muxer = new Muxer.Muxer({
          target: new Muxer.ArrayBufferTarget(),
          video: { codec: muxerVideoCodec, width, height },
          audio: { codec: 'aac', sampleRate: 44100, numberOfChannels: 2 },
          fastStart: 'in-memory'
        });

        let encodedFrames = 0;
        const totalFrames = Math.ceil(this.duration * this.fps);

        let videoEncoder = new VideoEncoder({
          output: (chunk, meta: any) => {
            if (meta && meta.decoderConfig && meta.decoderConfig.colorSpace === null) {
               meta = {
                 ...meta,
                 decoderConfig: { ...meta.decoderConfig }
               };
               delete meta.decoderConfig.colorSpace;
            }

            let duration = chunk.duration;
            if (typeof duration !== 'number' || duration < 0 || isNaN(duration)) {
              duration = Math.floor(1_000_000 / this.fps);
            }
            
            const data = new Uint8Array(chunk.byteLength);
            chunk.copyTo(data);

            muxer.addVideoChunkRaw(data, chunk.type, chunk.timestamp, duration, meta);
            encodedFrames++;
          },
          error: e => reject(e)
        });

        const videoConfig: any = {
          codec: selectedCodec,
          width,
          height,
          bitrate: 5_000_000,
          framerate: this.fps,
          hardwareAcceleration: 'prefer-hardware'
        };

        if (selectedCodec.startsWith('hvc')) {
          videoConfig.hevc = { format: 'hevc' };
        } else if (selectedCodec.startsWith('avc')) {
          videoConfig.avc = { format: 'avc' };
        }

        videoEncoder.configure(videoConfig);

        let audioEncoder = new AudioEncoder({
          output: (chunk, meta: any) => {
            // Safari workaround: force AAC decoderConfig if missing
            if (!meta) meta = {};
            if (!meta.decoderConfig) {
              meta.decoderConfig = {
                codec: 'mp4a.40.2',
                sampleRate: 44100,
                numberOfChannels: 2,
                description: new Uint8Array([0x12, 0x10]) // AAC-LC, 44.1kHz, Stereo
              };
            }

            let duration = chunk.duration;
            if (typeof duration !== 'number' || duration < 0 || isNaN(duration)) {
              duration = 0;
            }
            const data = new Uint8Array(chunk.byteLength);
            chunk.copyTo(data);
            muxer.addAudioChunkRaw(data, chunk.type, chunk.timestamp, duration, meta);
          },
          error: e => reject(e)
        });
        
        audioEncoder.configure({
          codec: 'mp4a.40.2',
          sampleRate: 44100,
          numberOfChannels: 2,
          bitrate: 128_000
        });

        // Decode audio
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
        const decodedAudio = await audioCtx.decodeAudioData(this.audioBuffer.slice(0));
        
        const channelData = [
          decodedAudio.getChannelData(0),
          decodedAudio.numberOfChannels > 1 ? decodedAudio.getChannelData(1) : decodedAudio.getChannelData(0)
        ];
        
        const length = channelData[0].length;
        const sampleRate = 44100;
        const framesPerChunk = sampleRate; // 1 second chunks

        for (let i = 0; i < length; i += framesPerChunk) {
            if (this.aborted) throw new Error("Aborted");
            // Audio Backpressure: prevent queue overflow
            while (audioEncoder.encodeQueueSize > 30) {
               await new Promise(r => setTimeout(r, 10));
            }

            const chunkLength = Math.min(framesPerChunk, length - i);
            const combined = new Float32Array(chunkLength * 2);
            combined.set(channelData[0].subarray(i, i + chunkLength), 0);
            combined.set(channelData[1].subarray(i, i + chunkLength), chunkLength);
            
            const audioData = new AudioData({
                format: 'f32-planar',
                sampleRate,
                numberOfFrames: chunkLength,
                numberOfChannels: 2,
                timestamp: (i / sampleRate) * 1e6,
                data: combined
            });
            audioEncoder.encode(audioData);
            audioData.close();
        }
        await audioEncoder.flush();

        // Encode video frames
        try {
          for (let currentFrame = 0; currentFrame < totalFrames; currentFrame++) {
            if (this.aborted) throw new Error("Aborted");
            // Backpressure: wait if queue is too large
            while (videoEncoder.encodeQueueSize > 15) {
              await new Promise(r => setTimeout(r, 10));
            }

            const currentTimeMs = (currentFrame / this.fps) * 1000;
            this.renderFrame(currentTimeMs);

            const videoFrame = new VideoFrame(this.canvas, {
              timestamp: (currentFrame / this.fps) * 1e6
            });

            videoEncoder.encode(videoFrame, { keyFrame: currentFrame % 30 === 0 });
            videoFrame.close();

            // Yield main thread to allow UI to update and encoder to process
            if (currentFrame % 15 === 0) {
               onProgress(encodedFrames / totalFrames); // UI update
               await new Promise(r => setTimeout(r, 0));
            }
          }

          // Submission complete, wait for encoding to finish
          while (encodedFrames < totalFrames) {
             if (this.aborted) throw new Error("Aborted");
             onProgress(encodedFrames / totalFrames);
             await new Promise(r => setTimeout(r, 50));
             if (videoEncoder.encodeQueueSize === 0) break; // Safety break
          }

          await videoEncoder.flush();
          onProgress(1); // 100%

          videoEncoder.close();
          audioEncoder.close();

          muxer.finalize();
          const { buffer } = muxer.target as Muxer.ArrayBufferTarget;
          resolve(new Blob([buffer], { type: 'video/mp4' }));

        } catch (err) {
          reject(err);
        }

      } catch (err) {
        reject(err);
      }
    });
  }
}
