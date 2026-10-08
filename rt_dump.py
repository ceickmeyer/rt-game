#!/usr/bin/env python3
"""
Dump Rotten Tomatoes critic + audience scores to a JSON file using MDBList.

Usage:
  python rt_dump.py <source> [<source> ...]
  python rt_dump.py --votes        # fill in IMDb vote counts for movies saved before they were recorded

The API key is read from MDBLIST_KEY in .env (or the environment).

A source can be:
  - a public MDBList list URL (e.g. https://mdblist.com/lists/someuser/some-list)
  - a text file with one IMDb ID per line (tt0111161)

Re-running is safe: movies already in rt_scores.json are skipped, so you can
run it again the next day if you hit the daily API limit.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

def load_env(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")):
    """Reads KEY=value lines from .env without overriding variables already set."""
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            key, sep, value = line.strip().partition("=")
            if sep and key and not key.startswith("#"):
                os.environ.setdefault(key.strip(), value.strip().strip("'\""))


load_env()
API_KEY = os.environ.get("MDBLIST_KEY")
OUT_FILE = "rt_scores.json"
DELAY = 1.0          # seconds between requests (be nice to the free tier)
SAVE_EVERY = 10      # write progress to disk every N movies


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "rt-guess-game/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def collect_ids(sources):
    ids = []
    for src in sources:
        if src.startswith("http"):
            url = src.rstrip("/")
            if not url.endswith("/json"):
                url += "/json"
            items = get_json(url)
            for item in items:
                if item.get("mediatype", "movie") == "movie" and item.get("imdb_id"):
                    ids.append(item["imdb_id"])
            print(f"  {len(items)} items from {src}")
        else:
            with open(src) as f:
                ids += [line.strip() for line in f if line.strip().startswith("tt")]
    return list(dict.fromkeys(ids))  # dedupe, keep order


CRITIC_NAMES = ["tomatoes", "tomatometer", "rottentomatoes"]
AUDIENCE_NAMES = ["popcorn", "tomatoesaudience", "audience", "rtaudience"]


def pick(scores, names):
    for name in names:
        val = scores.get(name)
        if val is not None:
            return val
    return None


class ApiError(Exception):
    pass


def fetch_movie(imdb_id):
    query = urllib.parse.urlencode({"apikey": API_KEY, "i": imdb_id})
    data = get_json(f"https://mdblist.com/api/?{query}")
    # errors such as the daily limit come back as HTTP 200 with {"response": false, "error": "..."}
    if data.get("response") is False or data.get("error"):
        raise ApiError(data.get("error") or "no data")
    scores = {}
    votes = None
    for r in data.get("ratings", []):
        src = (r.get("source") or "").lower()
        if src == "imdb":
            votes = r.get("votes")  # how many people rated it: a stand-in for how well known it is
        val = r.get("value")
        if val is None:
            val = r.get("score")
        scores[src] = val
    return {
        "imdb_id": imdb_id,
        "title": data.get("title"),
        "year": data.get("year"),
        "poster": data.get("poster"),
        "critic": pick(scores, CRITIC_NAMES),
        "audience": pick(scores, AUDIENCE_NAMES),
        "votes": votes or 0,
        "_sources": {k: v for k, v in scores.items() if v is not None},
    }


def load_existing():
    if os.path.exists(OUT_FILE):
        with open(OUT_FILE) as f:
            return json.load(f)
    return {"movies": [], "skipped": []}


def save(db):
    tmp = OUT_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)
    os.replace(tmp, OUT_FILE)


def main():
    if not API_KEY:
        sys.exit("Add MDBLIST_KEY=your_key to .env first")
    backfill = "--votes" in sys.argv[1:]
    sources = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not sources and not backfill:
        sys.exit(__doc__)

    db = load_existing()
    by_id = {m["imdb_id"]: m for m in db["movies"]}
    if sources:
        print("Collecting IDs...")
        ids = collect_ids(sources)
        db["skipped"] = []  # always retry movies that were missing scores last time
    else:
        ids = []
    todo = [i for i in ids if i not in by_id]
    # saved movies without a vote count get re-fetched just for that
    if backfill:
        todo += [m["imdb_id"] for m in db["movies"] if m.get("votes") is None]
    print(f"{len(ids)} from sources, {len(todo)} to fetch\n")

    try:
        for n, imdb_id in enumerate(todo, 1):
            try:
                movie = fetch_movie(imdb_id)
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    print("\nRate limited (429). Saving and stopping. Run again later.")
                    break
                print(f"[{n}/{len(todo)}] {imdb_id}: HTTP {e.code}, skipping")
                continue
            except ApiError as e:
                if "limit" in str(e).lower():
                    print(f"\nMDBList: {e} Saving and stopping. Run again tomorrow.")
                    break
                print(f"[{n}/{len(todo)}] {imdb_id}: {e}, skipping")
                continue

            sources = movie.pop("_sources")
            if imdb_id in by_id:
                by_id[imdb_id]["votes"] = movie["votes"]
                print(f"[{n}/{len(todo)}] {movie['title']}: {movie['votes'] or 0:,} IMDb votes")
            elif movie["critic"] is None or movie["audience"] is None:
                db["skipped"].append(imdb_id)  # missing a score, useless for the game
                missing = "critic" if movie["critic"] is None else "audience"
                if movie["critic"] is None and movie["audience"] is None:
                    missing = "both"
                print(f"[{n}/{len(todo)}] {movie['title']}: missing {missing}, skipped "
                      f"(sources returned: {', '.join(sources) or 'none'})")
            else:
                db["movies"].append(movie)
                print(f"[{n}/{len(todo)}] {movie['title']} ({movie['year']}): "
                      f"critic {movie['critic']}%, audience {movie['audience']}%")

            if n % SAVE_EVERY == 0:
                save(db)
            time.sleep(DELAY)
    except KeyboardInterrupt:
        print("\nInterrupted, saving progress...")

    save(db)
    print(f"\nDone. {len(db['movies'])} movies in {OUT_FILE}")


if __name__ == "__main__":
    main()
