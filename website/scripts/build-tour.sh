#!/usr/bin/env bash
# Combine the 5 chapter clips + 5 voiceovers into ONE narrated MP4 walkthrough.
# Each segment runs for the length of its voiceover (video looped/trimmed to fit),
# all normalised to 1280x720 so segments concat without re-encode.
set -euo pipefail
cd "$(dirname "$0")/.."

V=scripts/tour-src/video
A=scripts/tour-src/audio
TMP=$(mktemp -d)
OUT=public/video/tour.mp4

declare -a CH=(
  "ch1.webm ch1-onboard.mp3"
  "ch2.webm ch2-pos.mp3"
  "ch3.webm ch3-channels.mp3"
  "ch4.webm ch4-margin.mp3"
  "ch5.webm ch5-eod.mp3"
)

: > "$TMP/list.txt"
i=0
for pair in "${CH[@]}"; do
  i=$((i+1))
  vid=$V/${pair% *}
  aud=$A/${pair#* }
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$aud")
  echo "segment $i: video=$vid audio=$aud dur=${dur}s"
  ffmpeg -y -loglevel error \
    -stream_loop -1 -i "$vid" -i "$aud" \
    -t "$dur" -map 0:v:0 -map 1:a:0 \
    -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p" \
    -c:v libx264 -preset veryfast -crf 25 -pix_fmt yuv420p \
    -c:a aac -b:a 128k -ac 2 -ar 44100 \
    "$TMP/seg$i.mp4"
  echo "file '$TMP/seg$i.mp4'" >> "$TMP/list.txt"
done

ffmpeg -y -loglevel error -f concat -safe 0 -i "$TMP/list.txt" -c copy "$OUT"
echo "=== built $OUT ==="
ffprobe -v error -show_entries format=duration:stream=width,height,codec_name -of default=noprint_wrappers=1 "$OUT"
ls -la "$OUT"
rm -rf "$TMP"
