#!/usr/bin/env bash

cd /home/ayakase/Documents/jisho-go/src/assets/lib || exit 1

# Clone original file as backup
cp dict-ver-3.json dict-ver-3-original.json

# Remove mobileId key from all grammar items
jq 'map(
  if .grammar then .grammar |= map(del(.mobileId)) else . end
)' dict-ver-3.json > dict-ver-3.json.tmp && mv dict-ver-3.json.tmp dict-ver-3.json

echo "Done! Original backed up as dict-ver-3-original.json"
echo "dict-ver-3.json has been updated in-place"

