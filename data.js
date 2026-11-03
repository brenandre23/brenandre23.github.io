// data.js — everything the dashboard shows. Edit this file only; portfolio.html and app.js read it.
// Sources: interactive_maps_dashboards_verified_updated.xlsx (maps) and
// "Major Geospatial Initiatives Since June 2026" (initiatives).
// date: 'YYYY-MM' or 'YYYY-MM-DD'. Leave '' until known; the timeline appears once items have dates.
// thumb: '' when there is no usable screenshot (a placeholder is shown).
// embed: false for sites that refuse to be shown inside another page (they open in a new tab instead).
window.PORTFOLIO = {
  owner: 'Brenan Andre',
  unit: 'Cartography Unit, World Bank',
  period: 'June – October 2026',
  updated: '2026-10-17',
  sources: ['interactive_maps_dashboards_verified_updated.xlsx', 'Major Geospatial Initiatives Since June 2026'],

  maps: [
    {id: 'food-inflation', ws: 'Food & Nutrition Security', title: 'Food & Real Food Price Inflation', type: 'Dashboard', url: 'https://designstudio.worldbank.org/maps/2026/FoodSecurity/index.html', thumb: 'thumbs/01.jpg', date: ''},
    {id: 'ipc-insecurity', ws: 'Food & Nutrition Security', title: 'IPC Phase / Food Insecurity', type: 'Interactive map', url: 'https://designstudio.worldbank.org/maps/2026/FoodSecurity/insecurity.html', thumb: 'thumbs/02.jpg', date: ''},
    {id: 'el-nino', ws: 'Food & Nutrition Security', title: 'El Niño and Agricultural Production', type: 'Interactive map', url: 'https://designstudio.worldbank.org/maps/2026/FoodSecurity/el-nino.html', thumb: 'thumbs/03.jpg', date: ''},
    {id: 'ipc-el-nino', ws: 'Food & Nutrition Security', title: 'Combined IPC × El Niño', type: 'Interactive map', url: 'https://designstudio.worldbank.org/maps/2026/FoodSecurity/combined.html', thumb: 'thumbs/04.jpg', date: ''},
    {id: 'fns-dashboard', ws: 'Food & Nutrition Security', title: 'Food Nutrition Security Dashboard', type: 'Dashboard', url: 'https://designstudio.worldbank.org/maps/2026/FoodNutritionSecurity/index.html?split=43', thumb: 'thumbs/05.jpg', date: ''},
    {id: 'food-flourish-1', ws: 'Food & Nutrition Security', title: 'Food Inflation Flourish Webmap 1', type: 'Flourish map', url: 'https://public.flourish.studio/visualisation/28987963/', thumb: 'thumbs/06.jpg', date: ''},
    {id: 'food-flourish-2', ws: 'Food & Nutrition Security', title: 'Food Inflation Flourish Webmap 2', type: 'Flourish map', url: 'https://public.flourish.studio/visualisation/28987330/', thumb: 'thumbs/07.jpg', date: ''},
    {id: 'fns-compare', ws: 'Food & Nutrition Security', title: 'Food Nutrition Security Compare Dashboard', type: 'Dashboard', url: 'https://designstudio.worldbank.org/maps/2026/FoodNutritionSecurity/index.html?view=compare&split=54', thumb: 'thumbs/08.jpg', date: ''},
    {id: 'icsid-en', ws: 'ICSID Membership', title: 'ICSID Membership Map, English', type: 'Flourish map', url: 'https://public.flourish.studio/visualisation/27926269/', thumb: 'thumbs/09.jpg', date: ''},
    {id: 'icsid-fr', ws: 'ICSID Membership', title: 'ICSID Membership Map, French', type: 'Flourish map', url: 'https://public.flourish.studio/visualisation/27925938/', thumb: 'thumbs/10.jpg', date: ''},
    {id: 'icsid-es', ws: 'ICSID Membership', title: 'ICSID Membership Map, Spanish', type: 'Flourish map', url: 'https://public.flourish.studio/visualisation/27925422/', thumb: 'thumbs/11.jpg', date: ''},
    {id: 'tourism-full', ws: 'Tourism Watch / Aviation', title: 'Tourism Watch Full Dashboard', type: 'Dashboard', url: 'https://designstudio.worldbank.org/maps/2026/TourismApp/app/dashboard.html', thumb: 'thumbs/12.jpg', date: ''},
    {id: 'tourism-simple', ws: 'Tourism Watch / Aviation', title: 'Tourism Watch Simple Embeddable Map', type: 'Interactive map', url: 'https://designstudio.worldbank.org/maps/2026/TourismApp/app/simple.html', thumb: 'thumbs/13.jpg', date: ''},
    {id: 'tourism-earlier', ws: 'Tourism Watch / Aviation', title: 'Earlier Tourism Dashboard', type: 'Dashboard', url: 'https://designstudio.worldbank.org/maps/2026/TourismApp/index.html?year=2026', thumb: 'thumbs/14.jpg', date: ''},
    {id: 'disasters-fcv', ws: 'GFDRR / Disasters in FCV', title: 'Disasters in FCV Settings Interactive Map', type: 'Interactive map', url: 'https://designstudio.worldbank.org/maps/2026/GFDDR/disasters_fcv.html', thumb: 'thumbs/15.jpg', date: ''},
    {id: 'scorecard-water', ws: 'FY26 WBG Scorecard', title: 'Safely Managed Drinking Water', type: 'Interactive map', url: 'https://designstudio.worldbank.org/maps/2026/RN/figure1-water-card.html', thumb: 'thumbs/16.jpg', date: ''},
    {id: 'scorecard-health', ws: 'FY26 WBG Scorecard', title: 'Global Health Security Index', type: 'Interactive map', url: 'https://designstudio.worldbank.org/maps/2026/RN/health-security-map.html', thumb: 'thumbs/17.jpg', date: ''},
    {id: 'flood-hydropower', ws: 'Flood Ratio / Hydropower', title: 'Flood Ratio / Hydropower Dashboard', type: 'Dashboard', url: 'https://designstudio.worldbank.org/maps/2026/flood-ratio-maps/', thumb: 'thumbs/18.jpg', date: ''},
    {id: 'power-explorer', ws: 'Regional Power Explorer / EPM', title: 'Regional Power Explorer', type: 'Dashboard', url: 'https://regional-power-explorer.vercel.app/', thumb: 'thumbs/19.jpg', date: ''},
    {id: 'power-explorer-ds', ws: 'Regional Power Explorer / EPM', title: 'Regional Power Explorer, Design Studio deployment', type: 'Dashboard', url: 'https://regional-power-explorer.vercel.app/', thumb: 'thumbs/20.jpg', date: '', note: 'Opens the Vercel version: the Design Studio copy is not loading its map data at the moment.'},
    {id: 'epm-explorer', ws: 'Regional Power Explorer / EPM', title: 'EPM Data Explorer', type: 'Prototype / explorer', url: 'https://epm-data-explorer.com/', thumb: '', date: '', embed: false},
    {id: 'lobito', ws: 'Lobito Corridor', title: 'Lobito Corridor Interactive Web Map', type: 'Interactive map', url: 'https://designstudio.worldbank.org/maps/2026/Angola_Transport_SyncServer/', thumb: 'thumbs/23.jpg', date: ''},
    {id: 'angola-sync', ws: 'Lobito Corridor', title: 'Angola Transport SyncServer Version', type: 'Interactive map', url: 'https://designstudio.worldbank.org/maps/2026/Angola_Transport_SyncServer/index.html', thumb: 'thumbs/23.jpg', date: ''},
    {id: 'forge-ui', ws: 'Forge / GeoAI / GSDI', title: 'Forge corridor demo: Road Intelligence UI prototype', type: 'Prototype / explorer', url: 'https://designstudio.worldbank.org/maps/2026/Forge-corridor-demo/roadbook.html', thumb: 'thumbs/25.jpg', date: '', note: 'Design prototype for the Ageospatial roads proof of concept: road geometry is real, other values are placeholders.'},
    {id: 'forge-ageospatial', ws: 'Forge / GeoAI / GSDI', title: 'Ageospatial World Bank Forge instance (vendor-built; requirements and testing)', type: 'Prototype / explorer', url: 'https://worldbankforge.ageospatial.com/', thumb: '', date: '', embed: false},
    {id: 'spid', ws: 'SPID / GSAP', title: 'SPID', type: 'Dashboard', url: 'https://designstudio.worldbank.org/maps/2026/PIP/spid/?view=25.0000%2C10.0000%2C2.20&year=latest&indicator=poor300&subgroup=ALL&active=1', thumb: 'thumbs/26.jpg', date: ''},
    {id: 'gsap', ws: 'SPID / GSAP', title: 'GSAP', type: 'Dashboard', url: 'https://designstudio.worldbank.org/maps/2026/PIP/gsap/', thumb: 'thumbs/27.jpg', date: ''},
    {id: 'jupiter-courts', ws: 'Dominican Republic JUPITER', title: 'Dominican Republic JUPITER Court Accessibility Dashboard', type: 'Dashboard', url: 'https://designstudiodevint.worldbank.org/2026/Court-Accessibility/', thumb: '', date: '', note: 'On the internal development server: loads on the Bank network only.'}
  ],

  // Work without a public link yet: shown as cards, not in the viewer.
  pending: [
    {ws: 'Public Administration Unit', title: 'Six HTML interactive maps', count: 6, note: 'Verified; final public URLs to be added.', date: ''}
  ],

  // The five priorities agreed for this review. Shown at the top of portfolio.html and as the slides of deck.html.
  // {tokens} are filled from the data (see fill() in charts.js). evidence: links into this dashboard. maps / prints: pictures for the slide.
  prioritiesIntro: 'Delivering on these priorities supports the department’s operations, and opens room for vertical growth and recognition as a reliable partner.',
  // Each fact appears once across the slides: points are written so no slide repeats another (deck.html). wide: the slide is its picture.
  priorities: [
    {id: 'productivity', title: 'Increasing productivity and revenue', stat: '{deliverables}', statLabel: 'deliverables in {hours} hours, about {perDeliverable} hours each',
      points: ['{print} print and report maps in {series} series', 'Automated production pipelines, and training the team to use them'],
      evidence: [['Print and report maps', 'portfolio.html#print-title']],
      prints: ['DRC49745', 'WLD49724', 'BOT49619', 'DOM49631', 'IND49668', 'EAF49675', 'YEM49678', 'WLD49727', 'UKR49785']},
    {id: 'interactive', title: 'Expanding the number of interactive applications', stat: '{interactive}', statLabel: 'interactive maps and dashboards',
      points: ['{dashboards} dashboards, {webmaps} interactive and Flourish maps and {prototypes} prototypes, with {pending} more awaiting public links',
        'Built to travel: language versions (ICSID in English, French and Spanish) and embeddable versions for other sites (Tourism Watch)'],
      evidence: [['Live viewer and gallery', 'portfolio.html#gallery-title']],
      maps: ['fns-dashboard', 'tourism-full', 'power-explorer', 'spid', 'disasters-fcv', 'icsid-en']},
    {id: 'partnerships', title: 'Building stronger cross-sector partnerships', stat: '{projects}', statLabel: 'teams and sectors served',
      points: ['Print maps for {areas} countries and regions, from DR Congo roads to India, Yemen and Botswana', 'External demonstrations of World Bank cartography and web mapping'],
      evidence: [['Where the maps are', 'portfolio.html#reach-title'], ['External demonstrations', 'portfolio.html#initiative-external']]},
    {id: 'management', title: 'Developing broader project management skills', stat: '2', statLabel: 'vendor proofs of concept: outreach, negotiation and oversight', wide: true,
      points: ['Digital infrastructure begun with ITS: Azure resource groups, a revamped backend, blob storage and ETL pipelines',
        'Proofs of concept with Ageospatial (transport roads) and CARTO (transport assistant)'],
      evidence: [['Infrastructure and platform', 'portfolio.html#initiative-platform'], ['Proofs of concept', 'portfolio.html#initiative-pocs'], ['Flourish training', 'portfolio.html#initiative-training']]},
    {id: 'ai', title: 'Helping lead AI adoption across the department', stat: '7+', statLabel: 'sessions teaching the team to connect to and use AI',
      points: ['Best practices, tutorials, workshops and automated world-map demos', 'Designed the architecture for AI integration into our products'],
      evidence: [['Map Builder platform', 'portfolio.html#initiative-map-builder'], ['AI enablement', 'portfolio.html#initiative-ai']]}
  ],
  // Cover of deck.html: maps not shown on any other slide.
  cover: {maps: ['ipc-insecurity', 'el-nino', 'scorecard-water', 'flood-hydropower', 'gsap', 'angola-sync'], prints: ['SSA49560', 'AFR49729', 'SYR49574', 'IRQ48741', 'SSD46873', 'RWA47850']},

  // Next steps on the deck's "what it means" slide. Edit freely.
  nextSteps: ['Finish the infrastructure', 'Take both proofs of concept to a decision', 'Roll the Map Builder out to the team',
    'Publish the Public Administration maps', 'Build the first AI integration into a product'],

  // Major initiatives (from "Major Geospatial Initiatives Since June 2026", updated October 2026). maps: ids above that show this work.
  initiatives: [
    {id: 'map-builder', title: 'Map Builder Platform and World Bank Webmap Standard', date: '',
      summary: 'A way to make interactive web maps and dashboards that follow the Bank’s cartography rules every time, built so a person or an AI assistant can use it.',
      points: ['The standard: a locked map template (131 files, checksummed) set by one map.json: world, region or country coverage, nine map templates, dashboards, flat and globe views, print, PNG, SVG and PDF exports, and a mobile layout.',
        'Cartography built in: geometry, borders and names only from World Bank sources, disputed areas, official names, the fixed disclaimer, logo and map stamp.',
        'The Map Builder: a nine-step web page from spreadsheet to finished map, with 14 ready-made presets; it downloads the map with a QA report.',
        'The GIS toolkit for AI agents: guided workflows (thematic, sub-national, hazard, accessibility, population, land cover, terrain, infrastructure), a catalog of about 300 datasets with licences, and a record of every analysis step.',
        'Quality and governance: about 120 automated checks per map at five screen sizes, sign-off and a changelog for every change to the standard, and scans for keys and internal links.'],
      maps: []},
    {id: 'ai', title: 'AI Adoption Across the Team', date: '',
      summary: 'Teaching the team to connect to and use AI, and designing how AI fits into our products.',
      points: ['At least seven sessions: best practices, tutorials, workshops and demonstrations of automated world-map production.',
        'Designed the architecture for AI integration into the unit’s products.'],
      maps: []},
    {id: 'platform', title: 'Self-Service Interactive Mapping Platform and Azure Infrastructure', date: '',
      summary: 'A three-track approach that lets clients update their own data while their interactive maps keep meeting World Bank cartographic requirements, plus the digital infrastructure behind it.',
      points: ['Track 1, open-source / in-house: an internal server talks to Airtable, so the data behind a map updates without rebuilding the map.',
        'Track 2, Esri: a route inside the Bank’s established Esri ecosystem and accreditation environment.',
        'Track 3, interim vendor: an external solution with IMA, usable while the in-house architecture progresses.',
        'Digital infrastructure begun with ITS: Azure resource groups, a revamped backend, blob storage, ETL pipelines, API-mediated data synchronization, and credential and security architecture.'],
      maps: ['angola-sync']},
    {id: 'pocs', title: 'Vendor Proofs of Concept: Ageospatial and CARTO', date: '',
      summary: 'Researched and contacted vendors, shaped requirements, and coordinate proofs of concept with them. The vendors build their platforms.',
      points: ['Ageospatial, transport: prototypes and workflows for a larger GeoAI proof of concept, testing AI-assisted geospatial analysis, data discovery, mapping and publishing.',
        'CARTO, transport: requirements for a natural-language transport analysis assistant (status to confirm).'],
      maps: ['forge-ui', 'forge-ageospatial']},
    {id: 'training', title: 'Flourish Training Series for Clients', date: '',
      summary: 'Developed and delivered training for clients on creating and maintaining interactive maps in Flourish.',
      points: ['A video series makes the workflow reusable without continuous Cartography Unit support.'],
      maps: ['icsid-en']},
    {id: 'boundaries', title: 'World Bank Administrative Boundaries Modernization', date: '',
      summary: 'Took responsibility for maintaining the World Bank’s administrative-unit boundaries for public use.',
      points: ['Distributing boundaries as vector tiles instead of heavier traditional boundary datasets: a more efficient foundation for interactive maps and web-geospatial applications.'],
      maps: []},
    {id: 'automation', title: 'Cartography Workflow Automation and Internal Capacity Building', date: '',
      summary: 'Developed and led internal training on automated production pipelines.',
      points: ['Helped the team use repeatable workflows that cut manual steps and speed up recurring cartographic and geospatial tasks.'],
      maps: []},
    {id: 'external', title: 'External Cartography Demonstrations and Knowledge Sharing', date: '',
      summary: 'Represented the World Bank Cartography function in external demonstrations and training sessions.',
      points: ['Showcased interactive mapping workflows, cartographic standards and emerging approaches to web-based geospatial visualization.'],
      maps: []}
  ]
};
