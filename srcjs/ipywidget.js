import maplibregl from "https://esm.sh/maplibre-gl@3.6.2";
import {ImageService} from './../../mapbox-gl-esri-sources/src/main.js';
import { applyMapMethod, getCustomMapMethods } from "./mapmethods";
import {getCoveringTiles} from "./tilebelt.js";
import {getTileBBox} from '@mapbox/whoots-js';

function createContainer(model) {
  const id = "pymaplibregl";
  const container = document.createElement("div");
  container.id = id;
  container.style.height = model.get("height");
  return container;
}

function updateModel(model, map) {
  model.set("center", map.getCenter());
  model.set("zoom", map.getZoom());
  model.save_changes();
}

function createMap(mapOptions, model) {
  const map = new maplibregl.Map(mapOptions);
  if (mapOptions.navigationControl === undefined) {
    mapOptions.navigationControl = true;
  }
  const customMapMethods = getCustomMapMethods(maplibregl, map);

  if (mapOptions.navigationControl) {
    map.addControl(new maplibregl.NavigationControl());
  }

  map.once("load", () => {
    console.log('map onload once..')
    map.resize();
    updateModel(model, map);

    const imageSourceId = 'imagery-source';

    const layers = map.getStyle().layers;
    // Find the index of the first symbol layer in the map style
    let firstSymbolId;
    for (let i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol') {
            firstSymbolId = layers[i].id;
            break;
        }
    }
    const imageService = new ImageService(imageSourceId, map, {
        url: model.get('imageservice_url'),
        renderingRule: {
          "rasterFunctionArguments": {
              "ColorrampName": "Plasma",
              "Raster": {
                  "rasterFunctionArguments": {
                      "StretchType": 5,
                      "Statistics": [[0, 30000000000000000, 910863682171422.1, 9474291611234248]],
                      "DRA":false,
                      "UseGamma":false,
                      "Gamma": [1],
                      "ComputeGamma":true,
                      "Min": 0,
                      "Max": 255
                  },
                  "rasterFunction": "Stretch",
                  "outputPixelType": "U8",
                  "variableName": "Raster"
              }
          },
          "rasterFunction": "Colormap",
          "variableName": "Raster"
      },
        //from: valid_times[0],
        //to: valid_times[1],
        getAttributionFromService:false,
        },
        { maxzoom:5,
          attribution:"Test",
        },
    );
    console.log(imageService)
   map.addLayer({
          id: 'imagery-layer',
          type: 'raster',
          source: imageSourceId
          },
          firstSymbolId
      );
    
    // Store the imageService instance on the map
    map.imageService = imageService;
  
    // Add imageService methods to customMapMethods
    Object.getOwnPropertyNames(Object.getPrototypeOf(imageService))
      .filter(prop => typeof imageService[prop] === 'function')
      .forEach(method => {
        customMapMethods[method] = (...args) => imageService[method](...args);
      });
  });

  map.on("zoomend", (e) => {
    updateModel(model, map);
  });

  map.on("moveend", (e) => {
    updateModel(model, map);
  });


  return [map, customMapMethods]; // Return both map and methods
}

async function precache({map, timesteps}) {
    console.log("Entering precache");
    console.log("Timesteps:", timesteps);
    let bounds = map.getBounds();
    let zoom = Math.ceil(map.getZoom());
    console.log('Zoom:', zoom);
    let tiles = getCoveringTiles([bounds._ne.lat, bounds._sw.lng, bounds._sw.lat, bounds._ne.lng], zoom)
    console.log(tiles)
    const bboxes = []
    for (let i = tiles[0]; i <= tiles[2]; i++) {
      for (let j = tiles[1]; j <= tiles[3]; j++) {
        bboxes.push(getTileBBox(j,i,zoom));
    }
  }
  //console.log("BBoxes:", bboxes);
  const url = map.imageService._source.tiles[0]
  
  const urlsToCache = [];
  for (const timestep of timesteps){
    let new_url = url.replace(/time\=\d+/,`time=${timestep}`)
    //console.log(new_url)
    bboxes.forEach(bbox=>{
      urlsToCache.push(new_url.replace('{bbox-epsg-3857}',bbox));
    })
  
  } 
  //console.log(new_urls)
  
  try {
    const cache = await caches.open('tile-cache');
    
    // Fetch and cache all URLs
    const fetchPromises = urlsToCache.map(async url => {
        // Check if already cached
        const matched = await cache.match(url);
        if (!matched) {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    await cache.put(url, response);
                }
            } catch (error) {
                console.warn(`Failed to cache ${url}:`, error);
            }
        }
    });

    await Promise.all(fetchPromises);
    console.log('Precaching complete');
  } catch (error) {
    console.error('Precaching failed:', error);
  }
}

export function render({ model, el }) {
  console.log("maplibregl", maplibregl.version);

  const container = createContainer(model);
  const mapOptions = Object.assign(
    { container: container },
    model.get("map_options"),
  );
  console.log(mapOptions);
  const [map, customMapMethods] = createMap(mapOptions, model);

  // As a  Workaround we need to pass maplibregl module to customMapMethods
  // to avoid duplicated imports (current bug in esbuild)

  const apply = (calls) => {
    calls.forEach((call) => {
      // Custom map call
      if (Object.keys(customMapMethods).includes(call[0])) {
        console.log("internal call", call);
        const [name, params] = call;
        customMapMethods[name](...params);
        return;
      }

      applyMapMethod(map, call);
    });
  };

  const calls = model.get("calls");

  map.on("load", () => {
    console.log("init calls", calls);
    apply(calls);
    model.set("_rendered", true);
    model.save_changes();
  });

  model.on("msg:custom", (msg) => {
    console.log("custom msg", msg);
    apply(msg.calls);
  });

  model.on("change:dragging", (o) => {
    //console.log("Changing dragPan", o.changed.dragging)
    if (!o.changed.dragging) {
      map.boxZoom.disable();
      map.dragPan.disable();
    } else {
      map.boxZoom.enable();
      map.dragPan.enable();
    }
  });
  
  model.on("change:timesteps", (o) => {
    let timesteps = o.changed.timesteps;
    precache({map, timesteps});
  });

  model.on("change:zoom", (o) => {
    let timesteps = model.get("timesteps");
    precache({map, timesteps})
  });

  //From python this means we need to do:
  //m.imageservice_renderingRule = {newdict:stuff}
  //m.imageservice_url = "New URL"
  model.on("change:imageservice_url", (o) => {
    console.log("imageservice url changing...");
    map.imageService.esriServiceOptions.url = o.changed.imageservice_url;
    map.imageService.esriServiceOptions.renderingRule =  model.get("imageservice_renderingrule");
    map.imageService._updateSource(); //Trigger clearing tiles and stuff
  });


  //The following does not work -- in part because
  //the imageservice source/url is not defined when
  //this gets called, since it is also updating.
  //we *could* try having our model include
  //zoom and center and whenever these change we
  //call them here like the above.

  //map.on("moveend", (o) => {
  //  let timesteps = model.get("timesteps");
  //  precache({map, timesteps})
  //});

  //map.on("zoomend", (o) => {
  //  let timesteps = model.get("timesteps");
  //  precache({map, timesteps})
  //});


  map.on('click', (e) => {
    //console.log('I saw a click');
    //console.log(e)
    model.send({
        type: 'click',
        lngLat: e.lngLat,
        point: e.point,
        features: e.features
    });
  });

  let lastMove = 0;
  map.on('mousemove', (e) => {
      const now = Date.now();
      if (now - lastMove > 20) {  // 20ms throttle
          //console.log(e.lngLat)
          model.send({
              type: 'mousemove',
              lngLat: e.lngLat,
              point: e.point,
              features: e.features
          });
          lastMove = now;
      }
  });

  map.on('mouseenter', (e) => {
      model.send({
          type: 'mouseenter',
          lngLat: e.lngLat,
          point: e.point,
          features: e.features
      });
  });

  map.on('mouseout', (e) => {
    console.log("Got a mouseout event...")
      model.send({
          type: 'mouseout',
          lngLat: e.lngLat,
          point: e.point,
          features: e.features
      });
  });


  map.on('mousedown', (e) => {
      model.send({
          type: 'mousedown',
          lngLat: e.lngLat,
          point: e.point,
          features: e.features
      });
  });

  map.on('mouseup', (e) => {
    model.send({
        type: 'mouseup',
        lngLat: e.lngLat,
        point: e.point,
        features: e.features
      });
  });

  el.appendChild(container);
}
