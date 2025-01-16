import maplibregl from "https://esm.sh/maplibre-gl@3.6.2";
import {ImageService} from './../../mapbox-gl-esri-sources/src/main.js';
import { applyMapMethod, getCustomMapMethods } from "./mapmethods";

function createContainer(model) {
  const id = "pymaplibregl";
  const container = document.createElement("div");
  container.id = id;
  container.style.height = model.get("height");
  return container;
}

function createMap(mapOptions, model) {
  const map = new maplibregl.Map(mapOptions);
  if (mapOptions.navigationControl === undefined) {
    mapOptions.navigationControl = true;
  }
  // Create customMapMethods at the start of createMap
  const customMapMethods = getCustomMapMethods(maplibregl, map);

  if (mapOptions.navigationControl) {
    map.addControl(new maplibregl.NavigationControl());
  }

  map.on("mouseover", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseout", () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("click", (e) => {
    model.set("lng_lat", e.lngLat);
    model.save_changes();
  });

  map.once("load", () => {
    console.log('map onload once..')
    map.resize();
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
        url: 'https://gis.earthdata.nasa.gov/image/rest/services/C2930763263-LARC_CLOUD/TEMPO_NO2_L3_V03_HOURLY_TROPOSPHERIC_VERTICAL_COLUMN/ImageServer',
        renderingRule: { "rasterFunction": "torch_RGB" },
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

  return [map, customMapMethods]; // Return both map and methods
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

  el.appendChild(container);
}
