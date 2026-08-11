# Atlas

Personal travel companion in Layla Hub.

## Current architecture

Atlas is a static GitHub Pages app backed by Supabase.

- **Supabase Auth + RLS** — Owner / Viewer access
- **Supabase** — schedules, private schedule fields, map places, notes, packing, expenses, current trip state, and Google Drive links
- **Google Maps JavaScript API + Places API (New)** — map, place search, markers, location
- **Open-Meteo** — current weather
- **Frankfurter** — foreign-currency → KRW exchange rates
- **Google Drive** — document storage; Atlas stores/reads folder links rather than file binaries

The former Apps Script Memory / Parser / Notion / Reasoning pipeline has been retired from the current web runtime.

## Web app

https://layla-000.github.io/Atlas/
