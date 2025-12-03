#!/usr/bin/env bash

cd /home/ayakase/Documents/jisho-go/src/assets/lib || exit 1

# Clone original file as backup
cp dict-ver-3.json dict-ver-3-original.json

# Remove writing key from all items
jq 'map(del(.writing))' dict-ver-3.json > dict-ver-3.json.tmp && mv dict-ver-3.json.tmp dict-ver-3.json

echo "Done! Original backed up as dict-ver-3-original.json"
echo "dict-ver-3.json has been updated in-place"

