#!/bin/sh
set -eu
mkdir -p /tmp/angela-ffmpeg-build
cd /tmp/angela-ffmpeg-build
tar -xJf /work/sources/ffmpeg.tar.xz --strip-components=1 --no-same-owner
./configure \
  --disable-autodetect --disable-network --disable-doc --disable-debug \
  --disable-programs --enable-ffmpeg --disable-x86asm \
  --disable-shared --enable-static --disable-everything \
  --enable-protocol=file,pipe \
  --enable-demuxer=mov,matroska,aac,mp3,wav,ogg,flac \
  --enable-decoder=aac,opus,vorbis,mp3,mp3float,flac,pcm_s16le,pcm_f32le \
  --enable-parser=aac,mpegaudio,opus,vorbis,flac \
  --enable-muxer=ipod,adts,wav \
  --enable-encoder=aac,pcm_s16le \
  --enable-filter=aresample,anull,aformat,atrim,asetpts \
  --enable-bsf=aac_adtstoasc
make -j2 ffmpeg
cp ffmpeg /work/ffmpeg
cp COPYING.LGPLv2.1 /work/licenses/ffmpeg.txt
cp LICENSE.md /work/licenses/ffmpeg-component-policy.txt
cp ffbuild/config.log /work/sources/ffmpeg-config.log
cc --version > /work/sources/compiler.txt
dpkg-query -W > /work/sources/build-packages.txt
ldd ffmpeg > /work/sources/ffmpeg-linked-libraries.txt
./ffmpeg -version > /work/sources/ffmpeg-version.txt
./ffmpeg -L > /work/sources/ffmpeg-license.txt 2>&1
