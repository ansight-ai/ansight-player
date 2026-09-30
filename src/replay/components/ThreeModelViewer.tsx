import { useEffect, useRef, useState } from 'react'
import { decodeBase64, downloadModel, type ModelTransferProgress } from './modelFileData'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { DRACOLoader, DRACO_GLTF_CONFIG } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

type ModelShadowSource = 'none' | 'key' | 'fill'

interface ModelLightingSettings {
  ambientColor: string
  ambientGroundColor: string
  ambientIntensity: number
  fillAzimuth: number
  fillColor: string
  fillElevation: number
  fillIntensity: number
  keyAzimuth: number
  keyColor: string
  keyElevation: number
  keyIntensity: number
  shadowSource: ModelShadowSource
}

const defaultLightingSettings: ModelLightingSettings = {
  ambientColor: '#ffffff',
  ambientGroundColor: '#57515f',
  ambientIntensity: 1.1,
  fillAzimuth: -129,
  fillColor: '#8bbcff',
  fillElevation: 17,
  fillIntensity: 0.6,
  keyAzimuth: 34,
  keyColor: '#ffffff',
  keyElevation: 44,
  keyIntensity: 1.8,
  shadowSource: 'none',
}

export function ThreeModelViewer({
  base64,
  extension,
  fileName,
  modelBytes,
  sourceUrl,
}: {
  base64?: string
  extension: string
  fileName: string
  modelBytes?: Uint8Array<ArrayBuffer>
  sourceUrl?: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const frameModelRef = useRef<() => void>(() => undefined)
  const gridRef = useRef<THREE.GridHelper | null>(null)
  const lightingSettingsRef = useRef<ModelLightingSettings>({ ...defaultLightingSettings })
  const applyLightingRef = useRef<(settings: ModelLightingSettings) => void>(() => undefined)
  const [message, setMessage] = useState<string | null>(null)
  const [isGridVisible, setIsGridVisible] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [lightingSettings, setLightingSettings] = useState<ModelLightingSettings>({ ...defaultLightingSettings })
  const [status, setStatus] = useState(`Loading ${fileName}…`)
  const [transferProgress, setTransferProgress] = useState<ModelTransferProgress | null>(null)

  const updateLighting = (patch: Partial<ModelLightingSettings>) => {
    const nextSettings = { ...lightingSettingsRef.current, ...patch }
    lightingSettingsRef.current = nextSettings
    applyLightingRef.current(nextSettings)
    setLightingSettings(nextSettings)
  }

  const resetLighting = () => updateLighting({ ...defaultLightingSettings })

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    let animationFrame = 0
    let isDisposed = false
    let modelRoot: THREE.Object3D | null = null
    let mixer: THREE.AnimationMixer | null = null
    const abortController = new AbortController()
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10_000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 0.9
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    host.replaceChildren(renderer.domElement)

    const resourceLoads = createModelResourceLoadingManager(sourceUrl)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.screenSpacePanning = true
    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x57515f, 1.1)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8)
    const fillLight = new THREE.DirectionalLight(0x8bbcff, 0.6)
    keyLight.shadow.mapSize.set(2048, 2048)
    fillLight.shadow.mapSize.set(2048, 2048)
    const shadowFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.24, transparent: true }),
    )
    shadowFloor.rotation.x = -Math.PI / 2
    shadowFloor.receiveShadow = true
    shadowFloor.visible = false
    scene.add(hemisphere, keyLight, keyLight.target, fillLight, fillLight.target, shadowFloor)

    const lightTargetCenter = new THREE.Vector3()
    let lightTargetRadius = 1

    const positionDirectionalLight = (
      light: THREE.DirectionalLight,
      azimuth: number,
      elevation: number,
    ) => {
      const azimuthRadians = THREE.MathUtils.degToRad(azimuth)
      const elevationRadians = THREE.MathUtils.degToRad(elevation)
      const horizontalScale = Math.cos(elevationRadians)
      const direction = new THREE.Vector3(
        Math.sin(azimuthRadians) * horizontalScale,
        Math.sin(elevationRadians),
        Math.cos(azimuthRadians) * horizontalScale,
      )
      light.target.position.copy(lightTargetCenter)
      light.position.copy(lightTargetCenter).addScaledVector(direction, Math.max(lightTargetRadius * 4, 4))
    }

    const configureShadowCamera = (light: THREE.DirectionalLight) => {
      const shadowCamera = light.shadow.camera
      const extent = Math.max(lightTargetRadius * 1.35, 1)
      shadowCamera.left = -extent
      shadowCamera.right = extent
      shadowCamera.top = extent
      shadowCamera.bottom = -extent
      shadowCamera.near = Math.max(lightTargetRadius * 0.01, 0.01)
      shadowCamera.far = Math.max(lightTargetRadius * 10, 20)
      shadowCamera.updateProjectionMatrix()
      light.shadow.bias = -0.0004
      light.shadow.normalBias = Math.max(lightTargetRadius * 0.002, 0.002)
    }

    const applyLighting = (settings: ModelLightingSettings) => {
      hemisphere.color.set(settings.ambientColor)
      hemisphere.groundColor.set(settings.ambientGroundColor)
      hemisphere.intensity = settings.ambientIntensity
      keyLight.color.set(settings.keyColor)
      keyLight.intensity = settings.keyIntensity
      fillLight.color.set(settings.fillColor)
      fillLight.intensity = settings.fillIntensity
      positionDirectionalLight(keyLight, settings.keyAzimuth, settings.keyElevation)
      positionDirectionalLight(fillLight, settings.fillAzimuth, settings.fillElevation)

      const shadowsEnabled = settings.shadowSource !== 'none'
      renderer.shadowMap.enabled = shadowsEnabled
      renderer.shadowMap.needsUpdate = shadowsEnabled
      keyLight.castShadow = settings.shadowSource === 'key'
      fillLight.castShadow = settings.shadowSource === 'fill'
      shadowFloor.visible = shadowsEnabled
      modelRoot?.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh) {
          mesh.castShadow = shadowsEnabled
          mesh.receiveShadow = shadowsEnabled
        }
      })
    }
    applyLightingRef.current = applyLighting
    applyLighting(lightingSettingsRef.current)

    const grid = new THREE.GridHelper(10, 20, 0x76727c, 0x4a4850)
    grid.material.transparent = true
    grid.material.opacity = 0.28
    gridRef.current = grid
    scene.add(grid)

    setMessage(null)
    setIsLoading(true)
    setIsGridVisible(true)
    setTransferProgress(null)
    setStatus(sourceUrl ? `Downloading ${fileName} from device…` : `Building ${fileName}…`)

    const resize = () => {
      const width = Math.max(host.clientWidth, 1)
      const height = Math.max(host.clientHeight, 1)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    function frameModel() {
      if (!modelRoot) {
        return
      }
      const bounds = new THREE.Box3().setFromObject(modelRoot)
      if (bounds.isEmpty()) {
        return
      }
      const sphere = bounds.getBoundingSphere(new THREE.Sphere())
      const radius = Math.max(sphere.radius, 0.01)
      const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))
      const direction = new THREE.Vector3(1, 0.72, 1).normalize()
      camera.position.copy(sphere.center).add(direction.multiplyScalar(distance * 1.18))
      camera.near = Math.max(radius / 1_000, 0.001)
      camera.far = Math.max(radius * 100, 100)
      camera.updateProjectionMatrix()
      controls.target.copy(sphere.center)
      controls.maxDistance = distance * 10
      controls.update()
      controls.saveState()
      grid.position.y = bounds.min.y
      grid.scale.setScalar(Math.max(radius / 5, 0.1))
      lightTargetCenter.copy(sphere.center)
      lightTargetRadius = radius
      shadowFloor.position.set(sphere.center.x, bounds.min.y - radius * 0.002, sphere.center.z)
      shadowFloor.scale.setScalar(Math.max(radius, 0.1))
      positionDirectionalLight(keyLight, lightingSettingsRef.current.keyAzimuth, lightingSettingsRef.current.keyElevation)
      positionDirectionalLight(fillLight, lightingSettingsRef.current.fillAzimuth, lightingSettingsRef.current.fillElevation)
      configureShadowCamera(keyLight)
      configureShadowCamera(fillLight)
    }
    frameModelRef.current = frameModel

    async function loadModel() {
      try {
        const bytes = modelBytes ?? (sourceUrl
          ? await downloadModel(sourceUrl, abortController.signal, (progress) => {
              if (isDisposed) {
                return
              }
              setTransferProgress(progress)
              setStatus(formatTransferProgress(fileName, progress))
            })
          : base64
            ? decodeBase64(base64)
            : null)
        if (!bytes) {
          throw new Error(`No model data was returned for ${fileName}.`)
        }
        if (!isDisposed) {
          setTransferProgress(null)
          setStatus(`Building ${fileName}…`)
        }
        const normalizedExtension = extension.toLowerCase()
        let object: THREE.Object3D
        let animations: THREE.AnimationClip[] = []
        if (normalizedExtension === '.glb' || normalizedExtension === '.gltf') {
          const source: ArrayBuffer | string = normalizedExtension === '.gltf'
            ? new TextDecoder().decode(bytes)
            : bytes.buffer
          const dracoLoader = new DRACOLoader()
            .setDecoderPath(DRACO_GLTF_CONFIG)
            .setWorkerLimit(2)
          const gltfLoader = new GLTFLoader(resourceLoads.manager)
            .setDRACOLoader(dracoLoader)
            .setMeshoptDecoder(MeshoptDecoder)
          try {
            const gltf = await gltfLoader.parseAsync(source, '')
            object = gltf.scene
            animations = gltf.animations
          } finally {
            dracoLoader.dispose()
          }
        } else if (normalizedExtension === '.obj') {
          const sourceText = new TextDecoder().decode(bytes)
          const objLoader = new OBJLoader(resourceLoads.manager)
          if (sourceUrl) {
            const materials = await loadObjMaterials(
              sourceText,
              sourceUrl,
              abortController.signal,
              resourceLoads,
            )
            if (materials) {
              objLoader.setMaterials(materials)
            }
          }
          object = objLoader.parse(sourceText)
        } else if (normalizedExtension === '.stl') {
          const geometry = new STLLoader().parse(bytes.buffer)
          geometry.computeVertexNormals()
          object = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ color: 0x8fb7ff, metalness: 0.08, roughness: 0.58 }),
          )
        } else {
          throw new Error(`The ${normalizedExtension || 'selected'} 3D format is not supported.`)
        }

        if (isDisposed) {
          disposeObject(object)
          return
        }
        modelRoot = object
        scene.add(modelRoot)
        applyLighting(lightingSettingsRef.current)
        let meshCount = 0
        let triangleCount = 0
        modelRoot.traverse((child) => {
          const mesh = child as THREE.Mesh
          if (!mesh.isMesh || !mesh.geometry) {
            return
          }
          meshCount += 1
          const geometry = mesh.geometry
          triangleCount += geometry.index
            ? geometry.index.count / 3
            : (geometry.attributes.position?.count ?? 0) / 3
        })
        if (animations.length > 0) {
          mixer = new THREE.AnimationMixer(modelRoot)
          animations.forEach((clip) => mixer?.clipAction(clip).play())
        }
        resize()
        frameModel()
        setMessage(null)
        setIsLoading(false)
        setStatus(`${meshCount.toLocaleString()} mesh${meshCount === 1 ? '' : 'es'} · ${Math.round(triangleCount).toLocaleString()} triangles`)
      } catch (error) {
        if (isDisposed || (error instanceof DOMException && error.name === 'AbortError')) {
          return
        }
        setMessage(error instanceof Error ? error.message : `Unable to render ${fileName}.`)
        setIsLoading(false)
        setTransferProgress(null)
      }
    }

    const clock = new THREE.Clock()
    function render() {
      mixer?.update(clock.getDelta())
      controls.update()
      renderer.render(scene, camera)
      animationFrame = window.requestAnimationFrame(render)
    }

    void loadModel()
    render()
    return () => {
      isDisposed = true
      abortController.abort()
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      controls.dispose()
      frameModelRef.current = () => undefined
      applyLightingRef.current = () => undefined
      gridRef.current = null
      scene.traverse((object) => disposeObject(object))
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [base64, extension, fileName, modelBytes, sourceUrl])

  return (
    <div className="file-model-viewer-shell">
      <div className="file-model-viewer-toolbar">
        <button onClick={() => frameModelRef.current()} type="button">Reset view</button>
        <button
          onClick={() => {
            const grid = gridRef.current
            if (!grid) {
              return
            }
            grid.visible = !grid.visible
            setIsGridVisible(grid.visible)
          }}
          type="button"
        >
          {isGridVisible ? 'Hide grid' : 'Show grid'}
        </button>
        <details className="file-model-lighting-menu">
          <summary>Lighting</summary>
          <div className="file-model-lighting-panel">
            <div className="file-model-lighting-heading">
              <strong>Scene lighting</strong>
              <button onClick={resetLighting} type="button">Reset</button>
            </div>

            <section className="file-model-lighting-group">
              <strong>Ambient</strong>
              <LightingRange
                label="Intensity"
                max={10}
                onChange={(ambientIntensity) => updateLighting({ ambientIntensity })}
                step={0.05}
                suffix="×"
                value={lightingSettings.ambientIntensity}
              />
              <div className="file-model-lighting-colors">
                <LightingColor
                  label="Sky"
                  onChange={(ambientColor) => updateLighting({ ambientColor })}
                  value={lightingSettings.ambientColor}
                />
                <LightingColor
                  label="Ground"
                  onChange={(ambientGroundColor) => updateLighting({ ambientGroundColor })}
                  value={lightingSettings.ambientGroundColor}
                />
              </div>
            </section>

            <DirectionalLightControls
              azimuth={lightingSettings.keyAzimuth}
              color={lightingSettings.keyColor}
              elevation={lightingSettings.keyElevation}
              intensity={lightingSettings.keyIntensity}
              label="Key light"
              onAzimuthChange={(keyAzimuth) => updateLighting({ keyAzimuth })}
              onColorChange={(keyColor) => updateLighting({ keyColor })}
              onElevationChange={(keyElevation) => updateLighting({ keyElevation })}
              onIntensityChange={(keyIntensity) => updateLighting({ keyIntensity })}
            />

            <DirectionalLightControls
              azimuth={lightingSettings.fillAzimuth}
              color={lightingSettings.fillColor}
              elevation={lightingSettings.fillElevation}
              intensity={lightingSettings.fillIntensity}
              label="Fill light"
              onAzimuthChange={(fillAzimuth) => updateLighting({ fillAzimuth })}
              onColorChange={(fillColor) => updateLighting({ fillColor })}
              onElevationChange={(fillElevation) => updateLighting({ fillElevation })}
              onIntensityChange={(fillIntensity) => updateLighting({ fillIntensity })}
            />

            <label className="file-model-lighting-select">
              <span>Shadows</span>
              <select
                aria-label="Model shadow source"
                onChange={(event) => updateLighting({ shadowSource: event.target.value as ModelShadowSource })}
                value={lightingSettings.shadowSource}
              >
                <option value="none">Off</option>
                <option value="key">Key light</option>
                <option value="fill">Fill light</option>
              </select>
            </label>
          </div>
        </details>
        <span className="file-model-viewer-status">{status}</span>
      </div>
      <div className="file-model-viewer-stage">
        <div aria-label={`3D preview of ${fileName}`} className="file-model-viewer" ref={hostRef} />
        {isLoading ? (
          <div className="file-model-loading" role="status">
            <strong>{status}</strong>
            <progress
              aria-label={`Download progress for ${fileName}`}
              max={transferProgress?.totalBytes || undefined}
              value={transferProgress?.totalBytes ? transferProgress.loadedBytes : undefined}
            />
          </div>
        ) : null}
      </div>
      {message ? <p className="inline-message">{message}</p> : null}
      <small>Drag to orbit · scroll to zoom · right-drag to pan</small>
    </div>
  )
}

function DirectionalLightControls({
  azimuth,
  color,
  elevation,
  intensity,
  label,
  onAzimuthChange,
  onColorChange,
  onElevationChange,
  onIntensityChange,
}: {
  azimuth: number
  color: string
  elevation: number
  intensity: number
  label: string
  onAzimuthChange: (value: number) => void
  onColorChange: (value: string) => void
  onElevationChange: (value: number) => void
  onIntensityChange: (value: number) => void
}) {
  return (
    <section className="file-model-lighting-group">
      <div className="file-model-lighting-group-heading">
        <strong>{label}</strong>
        <LightingColor label="Colour" onChange={onColorChange} value={color} />
      </div>
      <LightingRange label="Intensity" max={10} onChange={onIntensityChange} step={0.05} suffix="×" value={intensity} />
      <LightingRange label="Azimuth" max={180} min={-180} onChange={onAzimuthChange} suffix="°" value={azimuth} />
      <LightingRange label="Elevation" max={90} min={-90} onChange={onElevationChange} suffix="°" value={elevation} />
    </section>
  )
}

function LightingRange({
  label,
  max,
  min = 0,
  onChange,
  step = 1,
  suffix = '',
  value,
}: {
  label: string
  max: number
  min?: number
  onChange: (value: number) => void
  step?: number
  suffix?: string
  value: number
}) {
  return (
    <label className="file-model-lighting-range">
      <span>{label}</span>
      <input
        aria-label={`${label} ${suffix === '°' ? 'angle' : 'level'}`}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <output>{value.toFixed(step < 1 ? 2 : 0)}{suffix}</output>
    </label>
  )
}

function LightingColor({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label className="file-model-lighting-color">
      <span>{label}</span>
      <input aria-label={`${label} light colour`} onChange={(event) => onChange(event.target.value)} type="color" value={value} />
    </label>
  )
}

function formatTransferProgress(fileName: string, progress: ModelTransferProgress) {
  if (progress.totalBytes > 0) {
    const percentage = Math.min(100, Math.round(progress.loadedBytes / progress.totalBytes * 100))
    return `Downloading ${fileName} · ${percentage}% · ${formatBytes(progress.loadedBytes)} / ${formatBytes(progress.totalBytes)}`
  }
  return `Downloading ${fileName} · ${formatBytes(progress.loadedBytes)}`
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 ** 2).toFixed(1)} MB`
}

interface ModelResourceLoads {
  manager: THREE.LoadingManager
  waitForPendingLoads: () => Promise<void>
}

function createModelResourceLoadingManager(sourceUrl?: string): ModelResourceLoads {
  const manager = new THREE.LoadingManager()
  let hasPendingLoads = false
  let resolvePendingLoads: (() => void) | null = null
  let pendingLoads = Promise.resolve()

  manager.onStart = () => {
    if (hasPendingLoads) {
      return
    }
    hasPendingLoads = true
    pendingLoads = new Promise<void>((resolve) => {
      resolvePendingLoads = resolve
    })
  }
  manager.onLoad = () => {
    hasPendingLoads = false
    resolvePendingLoads?.()
    resolvePendingLoads = null
  }
  if (sourceUrl) {
    manager.setURLModifier((resourceUrl) => resolveModelResourceUrl(sourceUrl, resourceUrl))
  }

  return {
    manager,
    waitForPendingLoads: () => hasPendingLoads ? pendingLoads : Promise.resolve(),
  }
}

async function loadObjMaterials(
  sourceText: string,
  sourceUrl: string,
  signal: AbortSignal,
  resourceLoads: ModelResourceLoads,
): Promise<MTLLoader.MaterialCreator | null> {
  const materialLibraryPath = findObjMaterialLibraryPath(sourceText)
  if (!materialLibraryPath) {
    return null
  }

  const materialUrl = resolveModelResourceUrl(sourceUrl, materialLibraryPath)
  const response = await fetch(materialUrl, { cache: 'no-store', signal })
  if (!response.ok) {
    throw new Error(`Unable to load ${materialLibraryPath} (HTTP ${response.status}).`)
  }

  const materialDirectory = getDirectoryPath(materialLibraryPath)
  const materials = new MTLLoader(resourceLoads.manager).parse(
    await response.text(),
    materialDirectory ? `${materialDirectory}/` : '',
  )
  materials.preload()
  await resourceLoads.waitForPendingLoads()
  return materials
}

function findObjMaterialLibraryPath(sourceText: string): string | null {
  const match = /^\s*mtllib\s+(.+?)\s*$/im.exec(sourceText)
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, '') || null
}

function resolveModelResourceUrl(sourceUrl: string, resourceUrl: string): string {
  if (!resourceUrl || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(resourceUrl)) {
    return resourceUrl
  }

  const contentUrl = new URL(sourceUrl, window.location.href)
  const modelPath = contentUrl.searchParams.get('path')
  if (!modelPath) {
    return resourceUrl
  }

  contentUrl.searchParams.set('path', resolveModelRelativePath(modelPath, resourceUrl))
  return contentUrl.toString()
}

function resolveModelRelativePath(modelPath: string, resourceUrl: string): string {
  const normalizedResourceUrl = decodeModelResourcePath(resourceUrl.split(/[?#]/, 1)[0]).replaceAll('\\', '/')
  const pathSegments = normalizedResourceUrl.startsWith('/')
    ? []
    : getDirectoryPath(modelPath).replaceAll('\\', '/').split('/').filter(Boolean)

  normalizedResourceUrl.split('/').forEach((segment) => {
    if (!segment || segment === '.') {
      return
    }
    if (segment === '..') {
      pathSegments.pop()
      return
    }
    pathSegments.push(segment)
  })
  return pathSegments.join('/')
}

function decodeModelResourcePath(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function getDirectoryPath(path: string): string {
  const normalizedPath = path.replaceAll('\\', '/')
  const separatorIndex = normalizedPath.lastIndexOf('/')
  return separatorIndex >= 0 ? normalizedPath.slice(0, separatorIndex) : ''
}

function disposeObject(object: THREE.Object3D) {
  const mesh = object as THREE.Mesh
  mesh.geometry?.dispose()
  const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
  materials.forEach((material) => {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) {
        value.dispose()
      }
    }
    material.dispose()
  })
}
