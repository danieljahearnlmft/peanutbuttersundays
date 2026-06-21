# Map Data

The map is a **choropleth** of Los Angeles County's eight Service Planning Areas (SPAs), shaded by the number of people experiencing homelessness.

## Files

| File | Description |
|------|-------------|
| `spa-boundaries.geojson` | SPA region polygons (WGS84). Downloaded from LA County's public ArcGIS boundary service. Each feature has `SPA_NUM` (1–8), `SPA` ("1"–"8"), and `SPA_NAME`. |
| `index.html` | The map page. Counts are injected directly in the `COUNTS` object in the inline `<script>`. |

## How to Update the Numbers

1. Open `index.html` and find the `COUNTS` object in the inline `<script>`:
   ```js
   const COUNTS = { 1:6753, 2:10766, 3:4485, 4:16955, 5:5029, 6:13587, 7:4778, 8:5424 };
   ```
2. Each key is a `SPA_NUM` (1–8); each value is that region's count.
3. The color scale and legend live just below in `getColor()`. Adjust the breakpoints there if the data range changes.

Current data: 2025 LAHSA Greater Los Angeles Homeless Count (county total 72,195 | City of LA 43,695). Source: https://www.lahsa.org/homeless-count/

## Refreshing the Boundaries

The boundary file is static and rarely changes. To re-download:

```
curl -o spa-boundaries.geojson "https://arcgis.gis.lacounty.gov/arcgis/rest/services/LACounty_Dynamic/Administrative_Boundaries/MapServer/23/query?where=1=1&outFields=SPA,SPA_NAME,SPA_NUM&outSR=4326&maxAllowableOffset=0.002&f=geojson"
```
