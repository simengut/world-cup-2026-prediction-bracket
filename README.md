# World Cup 2026 Prediction Bracket

Static Vercel-ready bracket app generated from `Tippin VM 2026 -mal.xlsx`.

## Local preview

```sh
python3 -m http.server 5173
```

Open `http://localhost:5173`.

## Vercel

The project uses the `build` script in `package.json` and outputs static files to `dist`.

## Leaderboard backend

The app includes Vercel Functions for submissions and leaderboard data:

- `POST /api/submissions`
- `GET /api/leaderboard`

Connect a Neon Postgres database through Vercel Marketplace so Vercel sets `DATABASE_URL` or `POSTGRES_URL`.
The current Vercel project is connected to a Neon Free database resource named `neon-cyan-river`.

Scoring is equal-weight by round: one point for each predicted team that is actually alive in that stage. Set actual results in a Vercel environment variable named `ACTUAL_RESULTS`:

```json
{
  "round16": ["Canada", "Nederland"],
  "quarterfinals": ["Nederland"],
  "semifinals": [],
  "final": [],
  "champion": "Nederland"
}
```

Use the same team names as the app. Missing rounds are ignored until results are available.
