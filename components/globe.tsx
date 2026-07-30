"use client";

import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/types";

type GlobeProps = {
  places: Place[];
  onPick: (place: Place) => void;
};

type MapStyle = "satellite" | "street";
type TourStage = 0 | 1 | 2;
type CesiumModule = typeof import("cesium");

const TOUR_LABELS = ["完整地球", "共同版图", "城市巡游"] as const;
const WEB_MERCATOR_LATITUDE_LIMIT = 85.05112878;

function imageryLayerOptions(Cesium: CesiumModule, style: MapStyle) {
  return {
    brightness: style === "satellite" ? 0.82 : 0.72,
    contrast: style === "satellite" ? 1.12 : 1.08,
    saturation: style === "satellite" ? 0.92 : 0.5,
    gamma: 0.94,
    rectangle: Cesium.Rectangle.fromDegrees(
      -180,
      -WEB_MERCATOR_LATITUDE_LIMIT,
      180,
      WEB_MERCATOR_LATITUDE_LIMIT,
    ),
  };
}

async function createImageryProvider(
  Cesium: CesiumModule,
  style: MapStyle,
  ionToken: string,
  fallbackProvider: import("cesium").ImageryProvider,
) {
  if (style === "street") {
    if (ionToken) {
      try {
        return await Cesium.createWorldImageryAsync({
          style: Cesium.IonWorldImageryStyle.ROAD,
        });
      } catch {
        // Keep a readable Earth when the road layer is unavailable.
      }
    }
    try {
      return await Cesium.ArcGisMapServerImageryProvider.fromUrl(
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
        { enablePickFeatures: false },
      );
    } catch {
      return fallbackProvider;
    }
  }

  if (ionToken) {
    try {
      return await Cesium.createWorldImageryAsync({
        style: Cesium.IonWorldImageryStyle.AERIAL,
      });
    } catch {
      // Fall through to the public satellite provider.
    }
  }

  try {
    return await Cesium.ArcGisMapServerImageryProvider.fromUrl(
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
      { enablePickFeatures: false },
    );
  } catch {
    return fallbackProvider;
  }
}

async function createTerrainProvider(Cesium: CesiumModule, ionToken: string) {
  if (!ionToken) return undefined;
  try {
    return await Cesium.createWorldTerrainAsync({
      requestVertexNormals: true,
      requestWaterMask: true,
    });
  } catch (error) {
    console.warn("Cesium World Terrain is unavailable; using the continuous ellipsoid fallback.", error);
    return undefined;
  }
}

export default function Globe({ places, onPick }: GlobeProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<import("cesium").Viewer | null>(null);
  const cesium = useRef<CesiumModule | null>(null);
  const activeStyle = useRef<MapStyle>("satellite");
  const [failure, setFailure] = useState(false);
  const [ready, setReady] = useState(false);
  const [tileLoading, setTileLoading] = useState(true);
  const [mapStyle, setMapStyle] = useState<MapStyle>("satellite");
  const [tourStage, setTourStage] = useState<TourStage>(0);
  const [tourCityIndex, setTourCityIndex] = useState(0);
  const [tourShot, setTourShot] = useState(0);
  const [touring, setTouring] = useState(true);
  const hasIonToken = Boolean(process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN);

  useEffect(() => {
    let stopped = false;
    let handler: import("cesium").ScreenSpaceEventHandler | null = null;
    let renderTimer = 0;
    let canvas: HTMLCanvasElement | null = null;
    let stopTour: (() => void) | null = null;
    let removeTileProgress: (() => void) | null = null;

    async function mount() {
      try {
        const Cesium = await import("cesium");
        if (stopped || !host.current) return;

        window.CESIUM_BASE_URL = "/cesium/";
        const ionToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";
        Cesium.Ion.defaultAccessToken = ionToken;
        const polarProvider = await Cesium.TileMapServiceImageryProvider.fromUrl(
          Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
        );
        const imageryProvider = await createImageryProvider(Cesium, "satellite", ionToken, polarProvider);
        const terrainProvider = await createTerrainProvider(Cesium, ionToken);
        if (stopped || !host.current) return;

        // Web Mercator imagery stops at ±85.05°. Keeping it as the only layer
        // makes Cesium stretch its final pixel row into radial wedges at both
        // poles. Natural Earth covers the full ellipsoid and remains visible
        // only where the sharper satellite layer has no valid tiles.
        const polarBaseLayer = new Cesium.ImageryLayer(polarProvider, {
          brightness: 0.7,
          contrast: 1.08,
          saturation: 0.68,
          gamma: 0.9,
        });
        const instance = new Cesium.Viewer(host.current, {
          animation: false,
          baseLayer: polarBaseLayer,
          baseLayerPicker: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          navigationHelpButton: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
          shouldAnimate: true,
          requestRenderMode: true,
          maximumRenderTimeChange: 1 / 24,
          useBrowserRecommendedResolution: true,
          terrainProvider,
        });
        if (imageryProvider !== polarProvider) {
          instance.imageryLayers.add(new Cesium.ImageryLayer(
            imageryProvider,
            imageryLayerOptions(Cesium, "satellite"),
          ));
        }
        viewer.current = instance;
        cesium.current = Cesium;

        (instance.cesiumWidget.creditContainer as HTMLElement).style.display = "none";
        instance.scene.skyBox = undefined;
        instance.scene.backgroundColor = Cesium.Color.fromCssColorString("#010204");
        instance.scene.highDynamicRange = true;
        instance.scene.postProcessStages.fxaa.enabled = true;
        instance.resolutionScale = 1;
        instance.scene.globe.maximumScreenSpaceError = window.innerWidth < 740 ? 1.9 : 1.35;
        instance.scene.globe.tileCacheSize = window.innerWidth < 740 ? 112 : 240;
        instance.scene.globe.preloadAncestors = true;
        instance.scene.globe.preloadSiblings = false;
        instance.scene.globe.loadingDescendantLimit = 14;
        instance.scene.globe.depthTestAgainstTerrain = Boolean(terrainProvider);
        // Keep the Earth readable at every local time; the atmosphere still
        // provides depth without turning the visited hemisphere fully black.
        instance.scene.globe.enableLighting = false;
        instance.scene.globe.showGroundAtmosphere = true;
        instance.scene.globe.dynamicAtmosphereLighting = false;
        instance.scene.globe.baseColor = Cesium.Color.fromCssColorString("#07101b");
        if (instance.scene.skyAtmosphere) {
          instance.scene.skyAtmosphere.hueShift = -0.025;
          instance.scene.skyAtmosphere.saturationShift = -0.06;
          instance.scene.skyAtmosphere.brightnessShift = -0.13;
        }

        const controller = instance.scene.screenSpaceCameraController;
        controller.zoomFactor = 1.045;
        controller.maximumMovementRatio = 0.014;
        controller.inertiaZoom = 0.87;
        controller.inertiaSpin = 0.9;
        controller.minimumZoomDistance = 180000;
        controller.maximumZoomDistance = 23000000;
        controller.enableCollisionDetection = true;

        const starPoints = instance.scene.primitives.add(new Cesium.PointPrimitiveCollection());
        const starCount = window.innerWidth < 740 ? 1300 : 2800;
        for (let index = 0; index < starCount; index += 1) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const radius = 900000000;
          starPoints.add({
            position: new Cesium.Cartesian3(
              radius * Math.sin(phi) * Math.cos(theta),
              radius * Math.sin(phi) * Math.sin(theta),
              radius * Math.cos(phi),
            ),
            pixelSize: 0.55 + Math.random() * 1.25,
            color: Cesium.Color.WHITE.withAlpha(0.3 + Math.random() * 0.62),
          });
        }

        const byEntity = new Map<string, Place>();
        for (const place of places) {
          const entity = instance.entities.add({
            name: place.city || place.name,
            position: Cesium.Cartesian3.fromDegrees(place.longitude, place.latitude),
            point: {
              pixelSize: new Cesium.CallbackProperty(() => {
                const pulse = Math.sin(performance.now() / 650);
                return 6 + pulse * 0.7;
              }, false),
              color: Cesium.Color.fromCssColorString("#f8d07b"),
              outlineColor: Cesium.Color.fromCssColorString("#e8b85a4d"),
              outlineWidth: 4,
              scaleByDistance: new Cesium.NearFarScalar(250000, 1.12, 21000000, 0.66),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: place.city || place.name,
              font: "600 13px 'Noto Sans SC', sans-serif",
              fillColor: Cesium.Color.fromCssColorString("#fffaf0"),
              outlineColor: Cesium.Color.fromCssColorString("#020509"),
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString("#020509a8"),
              backgroundPadding: new Cesium.Cartesian2(8, 5),
              pixelOffset: new Cesium.Cartesian2(0, -23),
              scaleByDistance: new Cesium.NearFarScalar(300000, 1, 12500000, 0.68),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 12800000),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            description: `${place.country} · ${place.city || place.name}`,
          });
          byEntity.set(entity.id, place);
        }

        handler = new Cesium.ScreenSpaceEventHandler(instance.scene.canvas);
        handler.setInputAction((event: { position: import("cesium").Cartesian2 }) => {
          const picked = instance.scene.pick(event.position);
          const place = Cesium.defined(picked) ? byEntity.get(picked.id?.id) : undefined;
          if (!place) return;
          setTouring(false);
          instance.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(place.longitude, place.latitude, 1050000),
            orientation: {
              heading: 0,
              pitch: Cesium.Math.toRadians(-74),
              roll: 0,
            },
            duration: 1.35,
            complete: () => onPick(place),
          });
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        canvas = instance.scene.canvas;
        stopTour = () => setTouring(false);
        canvas.addEventListener("pointerdown", stopTour, { passive: true });
        canvas.addEventListener("wheel", stopTour, { passive: true });
        canvas.addEventListener("touchstart", stopTour, { passive: true });

        removeTileProgress = instance.scene.globe.tileLoadProgressEvent.addEventListener((pending: number) => {
          if (!stopped) setTileLoading(pending > 2);
        });
        renderTimer = window.setInterval(() => {
          if (stopped || instance.isDestroyed()) return;
          instance.scene.requestRender();
        }, 120);

        setReady(true);
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setTouring(false);
        }
      } catch (error) {
        console.error("Cesium globe failed to load", error);
        setFailure(true);
      }
    }

    void mount();
    return () => {
      stopped = true;
      window.clearInterval(renderTimer);
      removeTileProgress?.();
      handler?.destroy();
      if (canvas && stopTour) {
        canvas.removeEventListener("pointerdown", stopTour);
        canvas.removeEventListener("wheel", stopTour);
        canvas.removeEventListener("touchstart", stopTour);
      }
      viewer.current?.destroy();
      viewer.current = null;
      cesium.current = null;
    };
  }, [onPick, places]);

  useEffect(() => {
    if (!ready || !viewer.current || !cesium.current || activeStyle.current === mapStyle) return;
    let cancelled = false;
    const switchStyle = async () => {
      const Cesium = cesium.current;
      const instance = viewer.current;
      if (!Cesium || !instance || instance.isDestroyed()) return;
      try {
        const ionToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";
        if (!ionToken) {
          const currentLayer = instance.imageryLayers.get(Math.min(1, instance.imageryLayers.length - 1));
          if (!currentLayer) return;
          currentLayer.brightness = mapStyle === "satellite" ? 0.82 : 0.62;
          currentLayer.contrast = mapStyle === "satellite" ? 1.12 : 1.2;
          currentLayer.saturation = mapStyle === "satellite" ? 0.92 : 0.42;
          currentLayer.gamma = mapStyle === "satellite" ? 0.94 : 0.82;
          activeStyle.current = mapStyle;
          instance.scene.requestRender();
          return;
        }
        const provider = await createImageryProvider(
          Cesium,
          mapStyle,
          ionToken,
          instance.imageryLayers.get(0).imageryProvider,
        );
        if (cancelled || instance.isDestroyed()) return;
        while (instance.imageryLayers.length > 1) {
          instance.imageryLayers.remove(instance.imageryLayers.get(1), true);
        }
        if (provider !== instance.imageryLayers.get(0).imageryProvider) {
          instance.imageryLayers.add(new Cesium.ImageryLayer(provider, {
            ...imageryLayerOptions(Cesium, mapStyle),
          }));
        }
        activeStyle.current = mapStyle;
        instance.scene.requestRender();
      } catch (error) {
        console.error("Map style switch failed", error);
      }
    };
    void switchStyle();
    return () => { cancelled = true; };
  }, [mapStyle, ready]);

  useEffect(() => {
    if (!ready || !viewer.current || !cesium.current) return;
    const Cesium = cesium.current;
    const instance = viewer.current;
    const fallback = { longitude: 108, latitude: 27 };
    const center = places.length > 0
      ? {
          longitude: places.reduce((sum, place) => sum + place.longitude, 0) / places.length,
          latitude: places.reduce((sum, place) => sum + place.latitude, 0) / places.length,
        }
      : fallback;
    const globalShots = [
      { longitude: -22, latitude: 3, altitude: 17800000, heading: 8, pitch: -88 },
      { longitude: 18, latitude: 10, altitude: 15400000, heading: 32, pitch: -82 },
      { longitude: 42, latitude: -7, altitude: 18400000, heading: 348, pitch: -87 },
    ];
    const atlasShots = [
      { longitude: -13, latitude: 5, altitude: 6500000, heading: 12, pitch: -76 },
      { longitude: 15, latitude: 9, altitude: 5100000, heading: 56, pitch: -68 },
      { longitude: 4, latitude: -6, altitude: 7200000, heading: 318, pitch: -79 },
    ];

    if (tourStage === 0) {
      const shot = globalShots[tourShot % globalShots.length];
      instance.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          center.longitude + shot.longitude,
          Math.max(-68, Math.min(68, center.latitude + shot.latitude)),
          shot.altitude,
        ),
        orientation: {
          heading: Cesium.Math.toRadians(shot.heading),
          pitch: Cesium.Math.toRadians(shot.pitch),
          roll: 0,
        },
        duration: 5.2,
        easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      });
      return;
    }

    if (tourStage === 1) {
      const shot = atlasShots[tourShot % atlasShots.length];
      instance.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          center.longitude + shot.longitude,
          Math.max(-70, Math.min(70, center.latitude + shot.latitude)),
          shot.altitude,
        ),
        orientation: {
          heading: Cesium.Math.toRadians(shot.heading),
          pitch: Cesium.Math.toRadians(shot.pitch),
          roll: 0,
        },
        duration: 5,
        easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      });
      return;
    }

    const place = places[tourCityIndex % Math.max(places.length, 1)];
    if (!place) return;
    const cityShots = [
      { altitude: 1180000, heading: 8, pitch: -76 },
      { altitude: 680000, heading: 62, pitch: -61 },
      { altitude: 420000, heading: 126, pitch: -52 },
    ];
    const shot = cityShots[tourShot % cityShots.length];
    instance.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(place.longitude, place.latitude, shot.altitude),
      orientation: {
        heading: Cesium.Math.toRadians((tourCityIndex * 37 + shot.heading) % 360),
        pitch: Cesium.Math.toRadians(shot.pitch),
        roll: 0,
      },
      duration: 5,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    });
  }, [places, ready, tourCityIndex, tourShot, tourStage]);

  useEffect(() => {
    if (!touring || !ready || tileLoading) return;
    const timer = window.setTimeout(() => {
      setTourShot(0);
      setTourStage((current) => ((current + 1) % 3) as TourStage);
    }, 21000);
    return () => window.clearTimeout(timer);
  }, [ready, tileLoading, tourStage, touring]);

  useEffect(() => {
    if (!touring || !ready || tileLoading) return;
    const timer = window.setInterval(() => {
      setTourShot((current) => current + 1);
      if (tourStage === 2 && places.length > 1) {
        setTourCityIndex((current) => (current + 1) % places.length);
      }
    }, 6800);
    return () => window.clearInterval(timer);
  }, [places.length, ready, tileLoading, tourStage, touring]);

  const chooseStage = (stage: TourStage) => {
    setTourShot(0);
    setTourStage(stage);
    setTouring(true);
  };

  if (failure) {
    return <div className="globe-fallback">
      <span>◌</span>
      <p>地球暂时无法载入</p>
      <small>你仍可从城市档案浏览所有回忆。</small>
    </div>;
  }

  return <div className="globe-experience">
    <div ref={host} className="globe" aria-label="可拖动、缩放并点击城市的三维旅行地球" />
    <div className={`globe-tile-loading ${tileLoading ? "visible" : ""}`} aria-live="polite">
      <i /> 正在补全地球细节
    </div>
    <div className="globe-tour" aria-label="地球镜头">
      {TOUR_LABELS.map((label, index) => <button
        type="button"
        key={label}
        className={tourStage === index ? "active" : ""}
        onClick={() => chooseStage(index as TourStage)}
        aria-pressed={tourStage === index}
      >
        <small>0{index + 1}</small>
        <span>{label}</span>
      </button>)}
      <button
        type="button"
        className={`tour-play ${touring ? "active" : ""}`}
        onClick={() => setTouring((current) => !current)}
        aria-pressed={touring}
      >
        {touring ? "暂停巡游" : "继续巡游"}
      </button>
    </div>
    <div className="map-style-switch" aria-label="地图样式">
      <button type="button" className={mapStyle === "satellite" ? "active" : ""} onClick={() => setMapStyle("satellite")}>卫星</button>
      <button type="button" className={mapStyle === "street" ? "active" : ""} onClick={() => setMapStyle("street")}>{hasIonToken ? "地图" : "夜色"}</button>
    </div>
  </div>;
}
