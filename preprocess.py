"""
Preprocesses all parquet files from player_data/ into a single JSON file
that the React app can load.

Usage:
  1. Place the unzipped player_data/ folder next to this script
  2. Run: python3 preprocess.py
  3. Output: public/game_data.json
"""

import os
import json
import pandas as pd
import pyarrow.parquet as pq
from pathlib import Path
from datetime import datetime

DATA_DIR = "player_data"   # ← folder with February_10, February_11, etc.
OUTPUT = "public/game_data.json"

def process():
    all_events = []
    file_count = 0
    error_count = 0

    # Walk through each day folder
    for day_folder in sorted(Path(DATA_DIR).iterdir()):
        if not day_folder.is_dir():
            continue
        
        # Extract date from folder name (e.g., "February_10" → "2026-02-10")
        folder_name = day_folder.name  # e.g., "February_10"
        parts = folder_name.split("_")
        if len(parts) != 2:
            continue
        
        month_name = parts[0]   # "February"
        day_num = parts[1]      # "10"
        
        # Convert to date string
        month_map = {
            "January": "01", "February": "02", "March": "03",
            "April": "04", "May": "05", "June": "06",
            "July": "07", "August": "08", "September": "09",
            "October": "10", "November": "11", "December": "12",
        }
        month_num = month_map.get(month_name, "01")
        date_str = f"2026-{month_num}-{int(day_num):02d}"

        print(f"Processing {folder_name} ({date_str})...")

        for filepath in sorted(day_folder.iterdir()):
            if not filepath.name.endswith(".nakama-0"):
                continue
            
            try:
                # Read parquet file
                table = pq.read_table(str(filepath))
                df = table.to_pandas()

                # Decode event column from bytes to string
                if df['event'].dtype == object:
                    df['event'] = df['event'].apply(
                        lambda x: x.decode('utf-8') if isinstance(x, bytes) else str(x)
                    )

                # Extract user_id and match_id from filename as fallback
                fname = filepath.name.replace(".nakama-0", "")
                fname_parts = fname.split("_", 1)
                fname_uid = fname_parts[0]
                fname_mid = fname_parts[1] + ".nakama-0" if len(fname_parts) > 1 else ""

                # Determine if bot (numeric user_id)
                uid = str(df['user_id'].iloc[0]) if len(df) > 0 else fname_uid
                is_bot = uid.replace("-", "").isdigit() if "-" not in uid else False
                if uid.isdigit():
                    is_bot = True

                # Convert timestamps to relative milliseconds
                # ts is stored as milliseconds representing time within the match
                ts_col = df['ts']
                if hasattr(ts_col.iloc[0], 'timestamp') if len(df) > 0 else False:
                    # It's a datetime, convert to epoch ms
                    ts_values = ts_col.apply(lambda x: int(x.timestamp() * 1000) if hasattr(x, 'timestamp') else int(x))
                else:
                    ts_values = ts_col.astype(int)

                for _, row in df.iterrows():
                    ts_val = int(row['ts'].timestamp() * 1000) if hasattr(row['ts'], 'timestamp') else int(row['ts'])
                    
                    all_events.append({
                        "uid": str(row['user_id']),
                        "mid": str(row['match_id']),
                        "map": str(row['map_id']),
                        "x": round(float(row['x']), 2),
                        "y": round(float(row['y']), 2),
                        "z": round(float(row['z']), 2),
                        "ts": ts_val,
                        "evt": str(row['event']) if not isinstance(row['event'], bytes) else row['event'].decode('utf-8'),
                        "date": date_str,
                        "bot": is_bot,
                    })

                file_count += 1

            except Exception as e:
                error_count += 1
                if error_count <= 5:
                    print(f"  Error reading {filepath.name}: {e}")

    print(f"\nProcessed {file_count} files, {error_count} errors")
    print(f"Total events: {len(all_events)}")

    # Sort by timestamp
    all_events.sort(key=lambda e: e['ts'])

    # Build matches index
    matches = {}
    for e in all_events:
        mid = e['mid']
        if mid not in matches:
            matches[mid] = {
                "id": mid,
                "map": e['map'],
                "date": e['date'],
                "humans": set(),
                "bots": set(),
            }
        if e['bot']:
            matches[mid]['bots'].add(e['uid'])
        else:
            matches[mid]['humans'].add(e['uid'])

    matches_list = []
    for m in matches.values():
        matches_list.append({
            "id": m['id'],
            "map": m['map'],
            "date": m['date'],
            "humans": len(m['humans']),
            "bots": len(m['bots']),
        })

    # Get unique dates
    dates = sorted(set(e['date'] for e in all_events))

    # Build output
    output = {
        "events": all_events,
        "matches": matches_list,
        "dates": dates,
        "stats": {
            "totalFiles": file_count,
            "totalEvents": len(all_events),
            "uniquePlayers": len(set(e['uid'] for e in all_events)),
            "uniqueMatches": len(matches),
        }
    }

    # Write to JSON
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, 'w') as f:
        json.dump(output, f)

    file_size_mb = os.path.getsize(OUTPUT) / (1024 * 1024)
    print(f"\n✅ Output written to {OUTPUT}")
    print(f"   File size: {file_size_mb:.1f} MB")
    print(f"   Dates: {dates}")
    print(f"   Matches: {len(matches_list)}")
    print(f"   Players: {output['stats']['uniquePlayers']}")

if __name__ == "__main__":
    process()