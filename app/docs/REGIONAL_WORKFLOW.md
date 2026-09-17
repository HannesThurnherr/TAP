# Regional workflow (TAP 0.1.4)

Uppercase names are extracted automatically (maximum 60 unique tokens per description).
Military abbreviations BLEM/WLEM/FOP/OLTI and compass directions are excluded. Hyphenated
chains split into anchors. Searches debounce and run with three workers; cancelled text
requests cannot replace current results. Names alone go to swisstopo, not the full description.
Gazetteer settlement features take precedence over municipal centroids; distinct homonyms
and generic rivers/regions/facilities require review. All automatic assignments remain proposals.
Selected anchors and unresolved names enter the prompt separately from manual location notes.

The prompt tells the external model to research unresolved positions, check regional context,
cite sources in notes, and calculate LV95 from WGS84 using the included swisstopo approximation.
It may define area.bounds [west,south,east,north], mode auto/map/terrain and the midpoint E0/N0.
Import validates bounds, origins, modes and geometry before replacing the scene. New-area imports
reset undo history; existing work must be saved first. Legacy configs without bounds still work.
The regional window is E=2300000–3000000, N=900000–1500000, 100 m–100 km per side.

Above 8 km (or when map mode is selected) the loader builds a bounded flat grid without
elevation/building requests. WMS map detail stays resolution/budget controlled. This is regional
Swiss mapping, not a worldwide terrain service; foreign map coverage is provider-dependent.
Detailed areas retain a coverage mask: invalid vertices are not meshed or grid-labelled.
One failed elevation tile no longer cancels good tiles; missing heights are represented by
a sampling fallback only, not a rendered invented terrain surface. If no valid elevations exist,
the loader reports an error and suggests map mode. Coordinates of symbols over uncovered terrain
cannot be treated as surveyed heights. Coverage statistics include the scene's loading margin.

Verification: 51 model tests, production build, live uppercase lookup using example names,
40 km map-only import rendered in browser, Basel border import rendered with 56% height coverage,
8 elevation tiles and zero failed downloads. Border coverage is not equivalent to a surveyed
political-boundary clipping mask; it follows actual available data. Windows remains cross-compiled
and not execution-tested. The guide is approximately 4,600 estimated tokens before user input.

Sources:
- https://docs.geo.admin.ch/access-data/search.html
- https://www.swisstopo.admin.ch/dam/en/sd-web/KLRCX9XIdXDu/ch1903wgs84-EN.pdf
