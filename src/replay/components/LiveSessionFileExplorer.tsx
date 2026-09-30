import {
  Archive,
  ArrowClockwise,
  ArrowUp,
  ArrowsIn,
  ArrowsOut,
  CaretDown,
  CaretRight,
  CaretUp,
  CircleNotch,
  Database as DatabaseIcon,
  FileText,
  Folder,
  HardDrive,
  Image as ImageIcon,
  MagnifyingGlass,
  Table,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  SessionFileDatabaseObject,
  SessionFileDatabaseQueryResult,
  SessionFileStructuredNode,
  SessionLiveFileContent,
  SessionLiveFileDirectory,
  SessionLiveFileEntry,
  SessionLiveFileListOptions,
} from '../sessionViewerData'
import { SdkCapabilityNotice } from './SdkCapabilityNotice'
import { ThreeModelViewer } from './ThreeModelViewer'
import { parseGlbFileContents } from './glbFileContents'
import { isLargeFilePreview, largeFilePreviewWarningBytes } from './liveFilePreview'
import { MediaFilePreview } from './MediaFilePreview'
import { resolveMediaFileFormat } from './mediaFileFormat'
import { decodeBase64, downloadModel, type ModelTransferProgress } from './modelFileData'

export type FileDatabaseQuery = (sql: string, maxRows: number) => Promise<SessionFileDatabaseQueryResult>

type LiveFileContextMenuState = {
  entry: SessionLiveFileEntry
  x: number
  y: number
}

export function LiveSessionFileExplorer({
  captureFile,
  externalCapture = false,
  listFiles,
  queryDatabase,
  readFile,
  sessionId,
}: {
  externalCapture?: boolean
  captureFile?: (
    sessionId: string,
    root: string,
    path: string,
  ) => Promise<string>
  listFiles: (
    sessionId: string,
    root: string | null,
    path: string,
    includeHidden: boolean,
    options?: SessionLiveFileListOptions,
  ) => Promise<SessionLiveFileDirectory>
  readFile: (
    sessionId: string,
    root: string,
    path: string,
    forceText?: boolean,
    allowLargeFile?: boolean,
  ) => Promise<SessionLiveFileContent>
  queryDatabase?: (
    sessionId: string,
    path: string,
    sql: string,
    maxRows: number,
    root?: string,
  ) => Promise<SessionFileDatabaseQueryResult>
  sessionId: string
}) {
  const [directory, setDirectory] = useState<SessionLiveFileDirectory | null>(null)
  const [rootAlias, setRootAlias] = useState<string | null>(null)
  const [path, setPath] = useState('')
  const [includeHidden, setIncludeHidden] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<SessionLiveFileEntry | null>(null)
  const [content, setContent] = useState<SessionLiveFileContent | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [fileNameSearch, setFileNameSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SessionLiveFileEntry[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isSearchTruncated, setIsSearchTruncated] = useState(false)
  const [contextMenu, setContextMenu] = useState<LiveFileContextMenuState | null>(null)
  const [largeFileWarningEntry, setLargeFileWarningEntry] = useState<SessionLiveFileEntry | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const loadDirectory = useCallback(async (nextRoot: string | null, nextPath: string) => {
    setIsLoading(true)
    setMessage(null)
    try {
      const next = await listFiles(sessionId, nextRoot, nextPath, includeHidden)
      setDirectory(next)
      setRootAlias(next.rootAlias || nextRoot || next.availableRoots?.[0]?.alias || null)
      setPath(normalizePath(next.relativePath ?? nextPath))
      setSelectedEntry(null)
      setContent(null)
      setFileNameSearch('')
      setSearchResults(null)
      setIsSearchTruncated(false)
      setContextMenu(null)
      setLargeFileWarningEntry(null)
    } catch (error) {
      setMessage(resolveErrorMessage(error, 'Unable to inspect the live app sandbox.'))
    } finally {
      setIsLoading(false)
    }
  }, [includeHidden, listFiles, sessionId])

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadDirectory(null, ''), 0)
    return () => window.clearTimeout(timeout)
  }, [loadDirectory])

  useEffect(() => {
    if (!contextMenu) {
      return undefined
    }

    const closeContextMenu = () => setContextMenu(null)
    const handlePointerDown = (event: PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) {
        closeContextMenu()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('blur', closeContextMenu)
    window.addEventListener('resize', closeContextMenu)
    window.addEventListener('scroll', closeContextMenu, true)
    contextMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('blur', closeContextMenu)
      window.removeEventListener('resize', closeContextMenu)
      window.removeEventListener('scroll', closeContextMenu, true)
    }
  }, [contextMenu])

  const entries = useMemo(
    () => sortEntries(searchResults ?? directory?.entries ?? []),
    [directory?.entries, searchResults],
  )

  async function openEntry(entry: SessionLiveFileEntry) {
    if (isDirectory(entry)) {
      await loadDirectory(entry.rootAlias || rootAlias, entry.relativePath)
      return
    }

    if (isLargeFilePreview(entry.sizeBytes) && !resolveMediaFileFormat(entry.name, entry.mimeType, entry.fileExtension)) {
      setSelectedEntry(entry)
      setContent(null)
      setMessage(null)
      setLargeFileWarningEntry(entry)
      return
    }

    await readEntry(entry, false)
  }

  async function readEntry(entry: SessionLiveFileEntry, forceText: boolean, allowLargeFile = false) {
    const resolvedRoot = entry.rootAlias || rootAlias
    if (!resolvedRoot) {
      setMessage('The app did not return a sandbox root for this file.')
      return
    }

    setSelectedEntry(entry)
    setContent(null)
    setLargeFileWarningEntry(null)
    setIsReading(true)
    setMessage(null)
    try {
      setContent(await readFile(sessionId, resolvedRoot, entry.relativePath, forceText, allowLargeFile))
    } catch (error) {
      setMessage(resolveErrorMessage(error, `Unable to read ${entry.name}.`))
    } finally {
      setIsReading(false)
    }
  }

  async function saveFileToTimeline(entry: SessionLiveFileEntry) {
    const resolvedRoot = entry?.rootAlias || rootAlias
    if (!captureFile || !entry || !resolvedRoot || isDirectory(entry)) {
      return
    }

    setIsCapturing(true)
    setMessage(null)
    try {
      await captureFile(sessionId, resolvedRoot, entry.relativePath)
      setMessage(`${entry.name} was saved to the session timeline.`)
    } catch (error) {
      setMessage(resolveErrorMessage(error, `Unable to save ${entry.name} to the session timeline.`))
    } finally {
      setIsCapturing(false)
    }
  }

  function openFileContextMenu(event: ReactMouseEvent<HTMLButtonElement>, entry: SessionLiveFileEntry) {
    if (!captureFile || isDirectory(entry)) {
      return
    }

    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    const requestedX = event.clientX || bounds.left + 24
    const requestedY = event.clientY || bounds.top + Math.min(bounds.height, 28)
    setContextMenu({
      entry,
      x: Math.max(8, Math.min(requestedX, window.innerWidth - 188)),
      y: Math.max(8, Math.min(requestedY, window.innerHeight - 52)),
    })
  }

  async function searchFileNames() {
    const query = fileNameSearch.trim()
    if (!query) {
      setSearchResults(null)
      setIsSearchTruncated(false)
      return
    }
    if (!rootAlias) {
      setMessage('The app did not return a sandbox root to search.')
      return
    }

    setIsSearching(true)
    setMessage(null)
    try {
      const result = await listFiles(sessionId, rootAlias, path, includeHidden, {
        recursive: true,
        maxDepth: 16,
        maxEntries: 1000,
      })
      const normalizedQuery = query.toLocaleLowerCase()
      setSearchResults((result.entries ?? []).filter(
        (entry) => entry.name.toLocaleLowerCase().includes(normalizedQuery),
      ))
      setIsSearchTruncated(result.truncated ?? false)
    } catch (error) {
      setMessage(resolveErrorMessage(error, 'Unable to search the live app sandbox.'))
    } finally {
      setIsSearching(false)
    }
  }

  function clearFileNameSearch() {
    setFileNameSearch('')
    setSearchResults(null)
    setIsSearchTruncated(false)
  }

  const parentPath = getParentPath(path)
  const pathSegments = path ? path.split('/') : []
  const roots = directory?.availableRoots ?? []
  return (
    <section className="live-file-explorer">
      <div className="live-file-explorer-heading">
        <div>
          <p className="eyebrow">Connected app</p>
          <h3>Live sandbox</h3>
          <span>{directory?.provider === 'adb'
            ? 'Browse the app sandbox through ADB.'
            : directory?.provider === 'simulator-filesystem'
              ? 'Browse the app sandbox through the simulator filesystem.'
              : externalCapture ? 'Browse the app sandbox through external file tools.' : 'Browse files directly through the Ansight SDK.'}</span>
          {externalCapture ? <small>Previews and SQLite queries read local copies. Use Save to timeline to retain a file.</small> : null}
        </div>
        <span className="status-pill status-pill--live"><i /> Live</span>
      </div>

      <div className="live-file-toolbar">
        <label>
          <HardDrive aria-hidden="true" />
          <select
            aria-label="Sandbox root"
            disabled={isLoading || roots.length === 0}
            onChange={(event) => void loadDirectory(event.target.value, '')}
            value={rootAlias ?? ''}
          >
            {roots.length === 0 ? <option value={rootAlias ?? ''}>{rootAlias || 'Default root'}</option> : null}
            {roots.map((root) => <option key={root.alias} value={root.alias}>{root.alias}</option>)}
          </select>
        </label>
        <button disabled={isLoading || !path} onClick={() => void loadDirectory(rootAlias, parentPath)} title="Parent folder" type="button">
          <ArrowUp aria-hidden="true" />
          Up
        </button>
        <button disabled={isLoading} onClick={() => void loadDirectory(rootAlias, path)} title="Refresh folder" type="button">
          <ArrowClockwise className={isLoading ? 'spin' : undefined} aria-hidden="true" />
          Refresh
        </button>
        <label className="live-file-hidden-toggle">
          <input checked={includeHidden} onChange={(event) => setIncludeHidden(event.target.checked)} type="checkbox" />
          Hidden files
        </label>
        <nav aria-label="Current folder" className="live-file-breadcrumb">
          {pathSegments.length > 0 ? (
            <button disabled={isLoading} onClick={() => void loadDirectory(rootAlias, '')} type="button">{rootAlias || 'root'}</button>
          ) : (
            <strong aria-current="page">{rootAlias || 'root'}</strong>
          )}
          {pathSegments.map((segment, index) => {
            const segmentPath = pathSegments.slice(0, index + 1).join('/')
            const isCurrent = index === pathSegments.length - 1
            return (
              <span className="live-file-breadcrumb-item" key={segmentPath}>
                <CaretRight aria-hidden="true" />
                {isCurrent ? (
                  <strong aria-current="page">{segment}</strong>
                ) : (
                  <button disabled={isLoading} onClick={() => void loadDirectory(rootAlias, segmentPath)} type="button">{segment}</button>
                )}
              </span>
            )
          })}
        </nav>
      </div>

      <form
        className="live-file-name-search"
        onSubmit={(event) => {
          event.preventDefault()
          void searchFileNames()
        }}
      >
        <MagnifyingGlass aria-hidden="true" />
        <input
          aria-label="Search files and folders"
          onChange={(event) => {
            setFileNameSearch(event.target.value)
            if (!event.target.value) {
              setSearchResults(null)
              setIsSearchTruncated(false)
            }
          }}
          placeholder={`Search ${rootAlias || 'sandbox'}${path ? `/${path}` : ''}`}
          spellCheck={false}
          type="search"
          value={fileNameSearch}
        />
        <span aria-live="polite">
          {isSearching
            ? 'Searching…'
            : searchResults
              ? `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}${isSearchTruncated ? '+' : ''}`
              : 'Names and folders'}
        </span>
        <button
          aria-label="Clear file search"
          disabled={!fileNameSearch && !searchResults}
          onClick={clearFileNameSearch}
          title="Clear search"
          type="button"
        >
          <X aria-hidden="true" />
        </button>
        <button disabled={isSearching || !fileNameSearch.trim()} type="submit">
          {isSearching ? <CircleNotch className="spin" aria-hidden="true" /> : null}
          Search
        </button>
      </form>

      {message ? <p className="inline-message live-file-message">{message}</p> : null}
      {externalCapture && message?.includes('Private files require a debuggable app') ? <SdkCapabilityNotice feature="fileAccess" /> : null}
      <div className="live-file-body">
        <div className="live-file-list" role="list">
          {isLoading && !directory ? (
            <div className="live-file-empty"><CircleNotch className="spin" aria-hidden="true" /> Loading sandbox…</div>
          ) : entries.length === 0 ? (
            <div className="live-file-empty">
              {searchResults ? <MagnifyingGlass aria-hidden="true" /> : <Folder aria-hidden="true" />}
              {searchResults ? ' No matching files or folders.' : ' This folder is empty.'}
            </div>
          ) : entries.map((entry) => (
            <button
              className={selectedEntry?.relativePath === entry.relativePath ? 'live-file-row live-file-row--selected' : 'live-file-row'}
              key={`${entry.rootAlias}:${entry.relativePath}`}
              onClick={() => void openEntry(entry)}
              onContextMenu={(event) => openFileContextMenu(event, entry)}
              role="listitem"
              type="button"
            >
              {isDirectory(entry) ? <Folder aria-hidden="true" /> : <FileText aria-hidden="true" />}
              <span>
                <strong>{entry.name}</strong>
                <small>{formatEntryDetail(entry)}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="live-file-preview">
          {largeFileWarningEntry ? (
            <LargeFilePreviewWarning
              fileName={largeFileWarningEntry.name}
              onCancel={() => {
                setLargeFileWarningEntry(null)
                setSelectedEntry(null)
              }}
              onOpen={() => void readEntry(largeFileWarningEntry, false, true)}
              sizeBytes={largeFileWarningEntry.sizeBytes ?? 0}
            />
          ) : isReading ? (
            <div className="live-file-download-progress" role="status">
              <CircleNotch className="spin" aria-hidden="true" />
              <strong>Downloading {selectedEntry?.name || 'file'} from device…</strong>
              <span>{selectedEntry?.sizeBytes ? formatBytes(selectedEntry.sizeBytes) : 'Waiting for the device…'}</span>
              <progress aria-label={`Download progress for ${selectedEntry?.name || 'file'}`} />
            </div>
          ) : content ? (
            <FileContentPreview
              content={content}
              entry={selectedEntry}
              isSavingToTimeline={isCapturing}
              key={`${selectedEntry?.rootAlias ?? ''}:${selectedEntry?.relativePath ?? content.fileName ?? ''}`}
              onSaveToTimeline={captureFile && selectedEntry ? () => void saveFileToTimeline(selectedEntry) : undefined}
              onOpenFullFile={selectedEntry ? () => void readEntry(selectedEntry, false, true) : undefined}
              onViewAsText={selectedEntry
                ? () => void readEntry(selectedEntry, true, isLargeFilePreview(selectedEntry.sizeBytes))
                : undefined}
              queryDatabase={selectedEntry && queryDatabase
                ? (sql, maxRows) => queryDatabase(sessionId, selectedEntry.relativePath, sql, maxRows, selectedEntry.rootAlias || rootAlias || undefined)
                : undefined}
            />
          ) : (
            <div className="live-file-empty"><FileText aria-hidden="true" /> Select a file to inspect its contents.</div>
          )}
        </div>
      </div>
      {contextMenu ? (
        <div
          aria-label={`Actions for ${contextMenu.entry.name}`}
          className="live-file-context-menu"
          ref={contextMenuRef}
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            disabled={isCapturing}
            onClick={() => {
              const entry = contextMenu.entry
              setContextMenu(null)
              void saveFileToTimeline(entry)
            }}
            role="menuitem"
            type="button"
          >
            {isCapturing ? <CircleNotch className="spin" aria-hidden="true" /> : <Archive aria-hidden="true" />}
            {isCapturing ? 'Saving…' : 'Save to timeline'}
          </button>
        </div>
      ) : null}
    </section>
  )
}

export function FileContentPreview({
  allowFullscreen = true,
  content,
  entry,
  hideIdentity = false,
  isSavingToTimeline = false,
  onSaveToTimeline,
  onOpenFullFile,
  onViewAsText,
  queryDatabase,
}: {
  allowFullscreen?: boolean
  content: SessionLiveFileContent
  entry: SessionLiveFileEntry | null
  hideIdentity?: boolean
  isSavingToTimeline?: boolean
  onSaveToTimeline?: () => void
  onOpenFullFile?: () => void
  onViewAsText?: () => void
  queryDatabase?: FileDatabaseQuery
}) {
  const fileName = content.fileName || entry?.name || 'Live file'
  const mediaFormat = resolveMediaFileFormat(fileName, content.mimeType || content.contentType || entry?.mimeType, content.fileExtension || entry?.fileExtension)
  const mimeType = mediaFormat?.mimeType || content.mimeType || content.contentType || entry?.mimeType || 'application/octet-stream'
  const viewerKind = !content.viewerKind || content.viewerKind === 'binary'
    ? mediaFormat?.kind || inferViewerKind(content, entry)
    : content.viewerKind
  const extension = content.fileExtension || entry?.fileExtension || getExtension(fileName)
  const isGlbViewer = viewerKind === 'model3d' && extension.toLowerCase() === '.glb'
  const isTruncated = content.isTruncated ?? content.truncated ?? false
  const displaySizeBytes = content.sizeBytes && content.sizeBytes > 0
    ? content.sizeBytes
    : entry?.sizeBytes ?? 0
  const isTextViewer = isTextViewerKind(viewerKind) && content.text !== undefined
  const [textViewMode, setTextViewMode] = useState<TextViewMode>('formatted')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const showIdentity = !hideIdentity || isFullscreen
  const showTextAction = !isTextViewer && !isGlbViewer && viewerKind !== 'audio' && viewerKind !== 'video' && !!onViewAsText
  const showSaveAction = !!onSaveToTimeline
  const showHeading = showIdentity || allowFullscreen || showTextAction || showSaveAction
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResultIndex, setSearchResultIndex] = useState(-1)
  const [searchResultCount, setSearchResultCount] = useState(0)
  const [isSearchResultTruncated, setIsSearchResultTruncated] = useState(false)
  const [activeSearchMatch, setActiveSearchMatch] = useState<Range | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const viewerContentRef = useRef<HTMLDivElement>(null)
  const searchMatchesRef = useRef<Range[]>([])

  useEffect(() => {
    if (!activeSearchMatch) {
      return
    }

    activeSearchMatch.startContainer.parentElement?.scrollIntoView({ block: 'center', inline: 'nearest' })
    if (typeof Highlight === 'undefined' || !CSS.highlights) {
      return
    }

    // Highlight the match without changing the document selection or input focus.
    const highlightName = 'ansight-file-search-match'
    const highlight = CSS.highlights.get(highlightName) ?? new Highlight()
    highlight.add(activeSearchMatch)
    CSS.highlights.set(highlightName, highlight)
    return () => {
      highlight.delete(activeSearchMatch)
      if (highlight.size === 0) {
        CSS.highlights.delete(highlightName)
      }
    }
  }, [activeSearchMatch])

  useEffect(() => {
    if (!isFullscreen) {
      return
    }

    document.body.classList.add('file-viewer-fullscreen-open')
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false)
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && isTextViewer) {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.classList.remove('file-viewer-fullscreen-open')
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen, isTextViewer])

  const refreshSearch = useCallback((preferredIndex = 0) => {
    const root = viewerContentRef.current
    if (!root || !searchQuery) {
      searchMatchesRef.current = []
      setSearchResultCount(0)
      setSearchResultIndex(-1)
      setIsSearchResultTruncated(false)
      setActiveSearchMatch(null)
      return
    }

    const matches = collectTextSearchMatches(root, searchQuery)
    searchMatchesRef.current = matches.ranges
    setSearchResultCount(matches.ranges.length)
    setIsSearchResultTruncated(matches.isTruncated)
    if (matches.ranges.length === 0) {
      setSearchResultIndex(-1)
      setActiveSearchMatch(null)
      return
    }

    const nextIndex = Math.min(Math.max(preferredIndex, 0), matches.ranges.length - 1)
    setSearchResultIndex(nextIndex)
    setActiveSearchMatch(matches.ranges[nextIndex])
  }, [searchQuery])

  useEffect(() => {
    const timeout = window.setTimeout(() => refreshSearch(0), 0)
    return () => window.clearTimeout(timeout)
  }, [content.rawText, content.text, fileName, refreshSearch, textViewMode, viewerKind])

  function moveSearchResult(direction: -1 | 1) {
    const matches = searchMatchesRef.current
    if (matches.length === 0) {
      return
    }
    const nextIndex = (searchResultIndex + direction + matches.length) % matches.length
    setSearchResultIndex(nextIndex)
    setActiveSearchMatch(matches[nextIndex])
  }

  let viewerContent: ReactNode
  let truncatedMessage: ReactNode = null

  if (viewerKind === 'sqlite' && content.databaseSchema) {
    viewerContent = <DatabasePreview content={content} key={fileName} queryDatabase={queryDatabase} />
  } else if (isTextViewer) {
    viewerContent = <TextContentPreview content={content} mode={textViewMode} viewerKind={viewerKind} />
    truncatedMessage = isTruncated ? (
      <>
        Preview limited to the first {formatBytes(content.bytesRead ?? largeFilePreviewWarningBytes)}.
        {onOpenFullFile ? <button onClick={onOpenFullFile} type="button">Open full file</button> : null}
      </>
    ) : null
  } else if (isGlbViewer && (content.base64 || content.contentUrl)) {
    viewerContent = <GlbFilePreview base64={content.base64} fileName={fileName} sourceUrl={content.contentUrl} />
  } else if (viewerKind === 'model3d' && (content.base64 || content.contentUrl)) {
    viewerContent = (
      <ThreeModelViewer
        base64={content.base64}
        extension={extension}
        fileName={fileName}
        sourceUrl={content.contentUrl}
      />
    )
  } else if ((content.contentUrl || content.base64) && viewerKind === 'image') {
    viewerContent = <img alt={fileName} src={content.contentUrl || `data:${mimeType};base64,${content.base64}`} />
  } else if ((content.contentUrl || content.base64) && viewerKind === 'pdf') {
    viewerContent = (
      <object className="file-pdf-preview" data={content.contentUrl || `data:${mimeType};base64,${content.base64}`} title={fileName} type="application/pdf">
        <p>This browser cannot display the PDF preview.</p>
      </object>
    )
  } else if ((viewerKind === 'audio' || viewerKind === 'video') && (content.contentUrl || content.base64)) {
    const sourceUrl = content.contentUrl || `data:${mimeType};base64,${content.base64}`
    viewerContent = <MediaFilePreview fileName={fileName} key={`${viewerKind}:${sourceUrl}`} kind={viewerKind} sourceUrl={sourceUrl} />
  } else {
    viewerContent = (
      <div className="live-file-binary">
        <ImageIcon aria-hidden="true" />
        <strong>{fileName}</strong>
        <span>{mimeType} · {formatBytes(displaySizeBytes)}</span>
        <small>Binary preview is not available.</small>
      </div>
    )
  }

  const frameClassName = [
    'file-viewer-frame',
    !showHeading ? 'file-viewer-frame--no-heading' : '',
    isTextViewer ? 'file-viewer-frame--text' : '',
    truncatedMessage ? 'file-viewer-frame--text-truncated' : '',
    isFullscreen ? 'file-viewer-frame--fullscreen' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={frameClassName}>
      {showHeading ? <div className={showIdentity ? 'live-file-preview-heading' : 'live-file-preview-heading live-file-preview-heading--actions-only'}>
        {showIdentity ? <div><strong>{fileName}</strong><small>{content.formatLabel || content.language || viewerKind}</small></div> : null}
        <div className="file-viewer-heading-actions">
          {showIdentity ? <span>{formatBytes(displaySizeBytes)}</span> : null}
          {showSaveAction ? (
            <button
              aria-label={isSavingToTimeline ? `Saving ${fileName} to timeline` : `Save ${fileName} to timeline`}
              className="file-save-to-timeline"
              disabled={isSavingToTimeline}
              onClick={onSaveToTimeline}
              title="Save a snapshot of this file to the session timeline"
              type="button"
            >
              {isSavingToTimeline ? <CircleNotch className="spin" aria-hidden="true" /> : <Archive aria-hidden="true" />}
              {isSavingToTimeline ? 'Saving…' : 'Save to timeline'}
            </button>
          ) : null}
          {showTextAction ? (
            <button
              aria-label={`View ${fileName} as text`}
              className="file-view-as-text"
              onClick={onViewAsText}
              title="View as text"
              type="button"
            >
              <FileText aria-hidden="true" />
              Text
            </button>
          ) : null}
          {allowFullscreen ? <button
            aria-label={isFullscreen ? 'Exit full screen' : 'View full screen'}
            onClick={() => setIsFullscreen((current) => !current)}
            title={isFullscreen ? 'Exit full screen' : 'View full screen'}
            type="button"
          >
            {isFullscreen ? <ArrowsIn aria-hidden="true" /> : <ArrowsOut aria-hidden="true" />}
          </button> : null}
        </div>
      </div> : null}
      {isTextViewer ? (
        <div className="file-text-toolbar">
          <div aria-label="Text view" className="file-view-mode" role="group">
            <button className={textViewMode === 'structured' ? 'active' : undefined} onClick={() => setTextViewMode('structured')} type="button">Structured</button>
            <button className={textViewMode === 'formatted' ? 'active' : undefined} onClick={() => setTextViewMode('formatted')} type="button">Formatted raw</button>
            <button className={textViewMode === 'raw' ? 'active' : undefined} onClick={() => setTextViewMode('raw')} type="button">Raw</button>
          </div>
          <label className="file-text-search">
            <MagnifyingGlass aria-hidden="true" />
            <input
              aria-label={`Search ${fileName}`}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  moveSearchResult(event.shiftKey ? -1 : 1)
                } else if (event.key === 'Escape') {
                  event.stopPropagation()
                  setSearchQuery('')
                }
              }}
              placeholder="Search file"
              ref={searchInputRef}
              type="search"
              value={searchQuery}
            />
            <span aria-live="polite">
              {searchQuery
                ? searchResultCount > 0
                  ? `${searchResultIndex + 1} / ${searchResultCount}${isSearchResultTruncated ? '+' : ''}`
                  : 'No matches'
                : ''}
            </span>
            <button aria-label="Previous match" disabled={searchResultCount === 0} onClick={() => moveSearchResult(-1)} title="Previous match" type="button"><CaretUp aria-hidden="true" /></button>
            <button aria-label="Next match" disabled={searchResultCount === 0} onClick={() => moveSearchResult(1)} title="Next match" type="button"><CaretDown aria-hidden="true" /></button>
          </label>
        </div>
      ) : null}
      {truncatedMessage ? <p className="inline-message inline-message--warning file-preview-limit-warning">{truncatedMessage}</p> : null}
      <div className={`file-viewer-stage file-viewer-stage--${viewerKind}`} ref={viewerContentRef}>
        {viewerContent}
      </div>
    </div>
  )
}

export function LargeFilePreviewWarning({
  fileName,
  onCancel,
  onOpen,
  sizeBytes,
}: {
  fileName: string
  onCancel: () => void
  onOpen: () => void
  sizeBytes: number
}) {
  return (
    <div className="large-file-preview-warning" role="alert">
      <WarningCircle aria-hidden="true" />
      <strong>Open this large file?</strong>
      <p>
        {fileName} is {formatBytes(sizeBytes)}, which is over the 10 MB preview threshold.
        Opening the full file may take longer and make the viewer less responsive.
      </p>
      <div>
        <button className="button button--secondary button--compact" onClick={onCancel} type="button">Cancel</button>
        <button className="button button--primary button--compact" onClick={onOpen} type="button">Open full file</button>
      </div>
    </div>
  )
}

type TextViewMode = 'structured' | 'formatted' | 'raw'

function GlbFilePreview({ base64, fileName, sourceUrl }: { base64?: string; fileName: string; sourceUrl?: string }) {
  const source = useMemo(() => ({ base64, sourceUrl }), [base64, sourceUrl])
  const [loadResult, setLoadResult] = useState<{
    source: typeof source
    bytes: Uint8Array<ArrayBuffer> | null
    message: string | null
    progress: ModelTransferProgress | null
  } | null>(null)
  const currentResult = loadResult?.source === source ? loadResult : null
  const bytes = currentResult?.bytes ?? null
  const message = currentResult?.message ?? null
  const progress = currentResult?.progress ?? null
  const [activeTab, setActiveTab] = useState<'model' | 'contents'>('model')
  const tabId = useId()

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const loaded = source.sourceUrl
          ? await downloadModel(source.sourceUrl, controller.signal, (progress) => {
              if (!controller.signal.aborted) setLoadResult({ source, bytes: null, message: null, progress })
            })
          : source.base64 ? decodeBase64(source.base64) : null
        if (!loaded) throw new Error('No GLB file data was returned.')
        if (!controller.signal.aborted) setLoadResult({ source, bytes: loaded, message: null, progress: null })
      } catch (error) {
        if (!controller.signal.aborted) setLoadResult({ source, bytes: null, message: resolveErrorMessage(error, 'Unable to read GLB contents.'), progress: null })
      }
    }
    void load()
    return () => controller.abort()
  }, [source])

  const contents = useMemo(() => {
    if (!bytes) return null
    try {
      return { file: parseGlbFileContents(bytes), error: null }
    } catch (error) {
      return { file: null, error: resolveErrorMessage(error, 'Unable to decode the GLB JSON chunk.') }
    }
  }, [bytes])
  const jsonContent = useMemo<SessionLiveFileContent | null>(() => contents?.file ? {
    fileName: `${fileName} JSON`,
    viewerKind: 'json',
    language: 'json',
    text: contents.file.formattedJson,
    rawText: contents.file.jsonText,
  } : null, [contents, fileName])

  return (
    <div className="file-glb-preview">
      <div aria-label="GLB view" className="file-view-mode" role="tablist">
        {(['model', 'contents'] as const).map((tab) => (
          <button
            aria-controls={`${tabId}-${tab}-panel`}
            aria-selected={activeTab === tab}
            className={activeTab === tab ? 'active' : undefined}
            id={`${tabId}-${tab}-tab`}
            key={tab}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault()
                const next = event.key === 'Home' ? 'model' : event.key === 'End' ? 'contents' : tab === 'model' ? 'contents' : 'model'
                setActiveTab(next)
                document.getElementById(`${tabId}-${next}-tab`)?.focus()
              }
            }}
            role="tab"
            tabIndex={activeTab === tab ? 0 : -1}
            type="button"
          >{tab === 'model' ? '3D view' : 'Contents (JSON)'}</button>
        ))}
      </div>
      {message ? <p className="inline-message" role="alert">{message}</p> : !bytes ? (
        <div className="live-file-download-progress" role="status">
          <CircleNotch className="spin" aria-hidden="true" />
          <strong>Loading {fileName}…</strong>
          {progress ? <span>{formatBytes(progress.loadedBytes)}{progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ''}</span> : null}
          <progress aria-label={`Download progress for ${fileName}`} max={progress?.totalBytes || undefined} value={progress?.totalBytes ? progress.loadedBytes : undefined} />
        </div>
      ) : <>
        <div aria-labelledby={`${tabId}-model-tab`} hidden={activeTab !== 'model'} id={`${tabId}-model-panel`} role="tabpanel">
          <ThreeModelViewer extension=".glb" fileName={fileName} modelBytes={bytes} sourceUrl={sourceUrl} />
        </div>
        <div aria-labelledby={`${tabId}-contents-tab`} hidden={activeTab !== 'contents'} id={`${tabId}-contents-panel`} role="tabpanel">
          {contents?.error ? <p className="inline-message" role="alert">{contents.error}</p> : null}
          {contents?.file && jsonContent ? <>
            <div className="file-glb-chunks" aria-label="GLB chunks">
              <span>GLB {contents.file.version} · {formatBytes(contents.file.byteLength)}</span>
              {contents.file.chunks.map((chunk) => <span key={chunk.byteOffset} title={`Byte offset ${chunk.byteOffset}; ${chunk.byteLength} bytes`}>{chunk.type} · {formatBytes(chunk.byteLength)}</span>)}
            </div>
            <FileContentPreview allowFullscreen={false} content={jsonContent} entry={null} hideIdentity />
          </> : null}
        </div>
      </>}
    </div>
  )
}

function TextContentPreview({
  content,
  mode,
  viewerKind,
}: {
  content: SessionLiveFileContent
  mode: TextViewMode
  viewerKind: string
}) {
  const rawText = content.rawText ?? content.text ?? ''
  const formattedText = content.text ?? rawText
  if (mode === 'raw') {
    return <pre className="file-raw-preview">{rawText}</pre>
  }
  if (mode === 'formatted') {
    return <CodePreview language={content.language || content.fileExtension || viewerKind} text={formattedText} />
  }

  if (viewerKind === 'json') {
    return <JsonPreview text={rawText} />
  }
  if (viewerKind === 'xml') {
    return content.structuredData
      ? <HostStructuredPreview root={content.structuredData.root} />
      : <XmlPreview text={rawText} />
  }
  if (viewerKind === 'csv') {
    return <CsvPreview text={rawText} />
  }
  if (viewerKind === 'markdown') {
    return <article className="file-markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{rawText}</ReactMarkdown></article>
  }
  return <CodePreview language={content.language || content.fileExtension || viewerKind} text={rawText} />
}

function JsonPreview({ text }: { text: string }) {
  const parsed = tryParseJson(text)
  if (!parsed.isSuccess) {
    return <CodePreview language="json" text={text} />
  }
  return <div className="file-structured-preview"><JsonNodeView depth={0} label="root" value={parsed.value} /></div>
}

function JsonNodeView({ depth, label, value }: { depth: number, label: string, value: unknown }) {
  if (value === null || typeof value !== 'object') {
    return <div className="file-structured-leaf"><span>{label}</span><code>{formatJsonPrimitive(value)}</code></div>
  }
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>)
  return (
    <details className="file-structured-node" open={depth < 2}>
      <summary><strong>{label}</strong><span>{Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`}</span></summary>
      <div>{entries.map(([key, child]) => <JsonNodeView depth={depth + 1} key={key} label={key} value={child} />)}</div>
    </details>
  )
}

function XmlPreview({ text }: { text: string }) {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (document.querySelector('parsererror') || !document.documentElement) {
    return <CodePreview language="xml" text={text} />
  }
  return <div className="file-structured-preview"><XmlNodeView depth={0} element={document.documentElement} /></div>
}

function XmlNodeView({ depth, element }: { depth: number, element: Element }) {
  const children = Array.from(element.children)
  const attributes = Array.from(element.attributes)
  const text = Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent?.trim())
    .filter(Boolean)
    .join(' ')
  return (
    <details className="file-structured-node" open={depth < 2 || children.length === 0}>
      <summary><strong>&lt;{element.tagName}&gt;</strong><span>{children.length} children</span></summary>
      <div>
        {attributes.map((attribute) => <div className="file-structured-leaf" key={attribute.name}><span>@{attribute.name}</span><code>{attribute.value}</code></div>)}
        {text ? <div className="file-structured-leaf"><span>text</span><code>{text}</code></div> : null}
        {children.map((child, index) => <XmlNodeView depth={depth + 1} element={child} key={`${child.tagName}-${index}`} />)}
      </div>
    </details>
  )
}

function HostStructuredPreview({ root }: { root: SessionFileStructuredNode }) {
  return <div className="file-structured-preview"><HostStructuredNodeView depth={0} node={root} /></div>
}

function HostStructuredNodeView({ depth, node }: { depth: number, node: SessionFileStructuredNode }) {
  if (node.children.length === 0) {
    return <div className="file-structured-leaf"><span>{node.name}</span><code>{node.value ?? node.kind}</code></div>
  }

  return (
    <details className="file-structured-node" open={depth < 2}>
      <summary><strong>{node.name}</strong><span>{node.value || `${node.children.length} items`}</span></summary>
      <div>{node.children.map((child, index) => (
        <HostStructuredNodeView depth={depth + 1} key={`${child.name}-${index}`} node={child} />
      ))}</div>
    </details>
  )
}

function CodePreview({ language = 'code', text }: { language?: string, text: string }) {
  return (
    <pre className="file-code-preview">{text.split('\n').map((line, index) => (
      <span className="file-code-line" key={index}><i>{index + 1}</i><code>{highlightCodeLine(line, language)}</code></span>
    ))}</pre>
  )
}

function highlightCodeLine(line: string, language: string): ReactNode {
  if (!line) {
    return ' '
  }

  const normalizedLanguage = language.replace(/^\./, '').toLowerCase()
  const isJson = normalizedLanguage.includes('json') || normalizedLanguage === 'har' || normalizedLanguage === 'geojson'
  const isXml = ['xml', 'xaml', 'plist', 'csproj', 'props', 'targets'].some((value) => normalizedLanguage.includes(value))
  const pattern = isJson
    ? /"(?:\\.|[^"\\])*"|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\b(?:true|false|null)\b|[{}[\],:]/gi
    : isXml
      ? /<!--.*?-->|<\/?[A-Za-z][^>]*>|&(?:[A-Za-z]+|#\d+|#x[0-9a-f]+);/gi
      : /\/\/.*$|#.*$|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:abstract|async|await|bool|boolean|break|case|catch|class|const|continue|default|do|double|else|enum|export|extends|false|finally|float|for|foreach|from|function|if|implements|import|in|int|interface|internal|let|namespace|new|null|override|private|protected|public|readonly|record|return|static|string|struct|switch|this|throw|true|try|type|typeof|using|var|virtual|void|while|yield)\b|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match = pattern.exec(line)
  while (match) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index))
    }

    const token = match[0]
    let tokenKind = 'keyword'
    if (token.startsWith('//') || token.startsWith('#') || token.startsWith('/*') || token.startsWith('<!--')) {
      tokenKind = 'comment'
    } else if (isXml && token.startsWith('<')) {
      tokenKind = 'tag'
    } else if (isXml && token.startsWith('&')) {
      tokenKind = 'literal'
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      const remainder = line.slice(match.index + token.length)
      tokenKind = isJson && /^\s*:/.test(remainder) ? 'property' : 'string'
    } else if (/^-?\d/.test(token)) {
      tokenKind = 'number'
    } else if (/^[{}[\],:]$/.test(token)) {
      tokenKind = 'punctuation'
    } else if (/^(?:true|false|null)$/i.test(token)) {
      tokenKind = 'literal'
    }
    parts.push(<span className={`syntax-token syntax-token--${tokenKind}`} key={`${match.index}-${tokenKind}`}>{token}</span>)
    lastIndex = match.index + token.length
    match = pattern.exec(line)
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex))
  }
  return parts
}

function CsvPreview({ text }: { text: string }) {
  const table = parseCsv(text)
  if (table.rows.length === 0) {
    return <div className="live-file-empty"><FileText aria-hidden="true" /> This CSV file is empty.</div>
  }

  const headers = table.rows[0]
  const rows = table.rows.slice(1, 501)
  return (
    <div className="file-csv-preview">
      <span>
        {Math.max(table.rows.length - 1, 0).toLocaleString()} rows · {headers.length.toLocaleString()} columns
        {table.rows.length > 501 ? ' · showing first 500 rows' : ''}
      </span>
      <table>
        <thead><tr><th>#</th>{headers.map((header, index) => <th key={index}>{header || `Column ${index + 1}`}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            <th>{rowIndex + 1}</th>
            {headers.map((_, columnIndex) => <td key={columnIndex}>{row[columnIndex] ?? ''}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function parseCsv(text: string): { rows: string[][] } {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1
      }
    } else {
      cell += character
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return { rows }
}

function DatabasePreview({
  content,
  queryDatabase,
}: {
  content: SessionLiveFileContent
  queryDatabase?: FileDatabaseQuery
}) {
  const objects = content.databaseSchema?.objects ?? []
  const [selectedObject, setSelectedObject] = useState<SessionFileDatabaseObject | null>(objects[0] ?? null)
  const [sql, setSql] = useState(() => createTableQuery(objects[0]?.name))
  const [result, setResult] = useState<SessionFileDatabaseQueryResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [databaseView, setDatabaseView] = useState<DatabaseViewMode>('columns')

  const runQuery = useCallback(async (nextSql: string) => {
    if (!queryDatabase || !nextSql.trim()) {
      return
    }
    setIsLoading(true)
    setMessage(null)
    try {
      setResult(await queryDatabase(nextSql, 500))
    } catch (error) {
      setMessage(resolveErrorMessage(error, 'Unable to query this database.'))
    } finally {
      setIsLoading(false)
    }
  }, [queryDatabase])

  function selectObject(object: SessionFileDatabaseObject) {
    const nextSql = createTableQuery(object.name)
    setSelectedObject(object)
    setSql(nextSql)
    setResult(null)
    setMessage(null)
    setDatabaseView('columns')
  }

  function showData() {
    setDatabaseView('data')
    if (!selectedObject) {
      return
    }

    const nextSql = createTableQuery(selectedObject.name)
    setSql(nextSql)
    if (result?.sql.trim() !== nextSql) {
      void runQuery(nextSql)
    }
  }

  return (
    <div className="file-database-preview database-viewer">
      <aside className="database-sidebar">
        <div className="database-sidebar-heading">Tables & views</div>
        {objects.length === 0 ? <p>No user tables or views were found.</p> : objects.map((object) => (
          <button className={selectedObject?.name === object.name ? 'active' : undefined} key={object.name} onClick={() => selectObject(object)} type="button">
            <span className="database-object-icon" aria-hidden="true">{object.type === 'view' ? <DatabaseIcon /> : <Table />}</span>
            <span>{object.name}</span>
            <small>{object.type}</small>
          </button>
        ))}
      </aside>
      <section className="database-detail">
        <header className="database-detail-header">
          <div>
            <strong>{selectedObject?.name || content.fileName || 'SQLite database'}</strong>
            <span>{selectedObject ? `${selectedObject.type} · live app` : 'SQLite · live app'}</span>
          </div>
          <div className="file-view-mode">
            <button className={databaseView === 'columns' ? 'active' : undefined} disabled={!selectedObject} onClick={() => setDatabaseView('columns')} type="button">Columns</button>
            <button className={databaseView === 'data' ? 'active' : undefined} disabled={!selectedObject || !queryDatabase} onClick={showData} type="button">Data</button>
            <button className={databaseView === 'query' ? 'active' : undefined} disabled={!queryDatabase} onClick={() => setDatabaseView('query')} type="button">SQL</button>
          </div>
        </header>

        {isLoading ? <div className="database-progress"><CircleNotch className="spin" aria-hidden="true" /> Working with the live database…</div> : null}
        {message ? <div className="database-error">{message}</div> : null}

        {databaseView === 'columns' && selectedObject ? (
          <div className="database-columns-wrap">
            <table className="database-columns">
              <thead><tr><th>Name</th><th>Type</th><th>Nullable</th><th>Default</th><th>Key</th></tr></thead>
              <tbody>{selectedObject.columns.map((column) => (
                <tr key={column.key}>
                  <td><strong>{column.name}</strong></td>
                  <td><code>{column.declaredType || '—'}</code></td>
                  <td>{column.isNullable ? 'Yes' : 'No'}</td>
                  <td><code>{column.defaultValue || '—'}</code></td>
                  <td>{column.isPrimaryKey ? 'Primary' : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}

        {databaseView === 'data' ? (
          <div className="database-data-view">
            {result ? <DatabaseResultTable result={result} /> : <div className="database-empty">Choose Data to load rows from this table.</div>}
            {result ? <footer className="database-pagination"><span>{result.message}</span><span>{result.rows.length.toLocaleString()} rows</span></footer> : null}
          </div>
        ) : null}

        {databaseView === 'query' ? (
          <div className="database-query-workspace">
            <div className="database-snapshot-notice">
              <div><strong>Live read-only query</strong><span>SQL runs through the connected app. Mutating statements are rejected by the Host.</span></div>
            </div>
            <div className="database-query-editor">
              <textarea aria-label="SQLite query" onChange={(event) => setSql(event.target.value)} spellCheck={false} value={sql} />
              <div className="database-query-actions">
                <span>Up to 500 result rows are rendered.</span>
                <button disabled={isLoading || !sql.trim()} onClick={() => void runQuery(sql)} type="button">Execute SQL</button>
              </div>
            </div>
            {result ? <div className="database-query-result-heading">{result.message}</div> : null}
            {result ? <DatabaseResultTable result={result} /> : null}
          </div>
        ) : null}

        {!selectedObject && databaseView !== 'query' ? <div className="database-empty">Choose a table, or open SQL to query the live database.</div> : null}
      </section>
    </div>
  )
}

type DatabaseViewMode = 'columns' | 'data' | 'query'

function DatabaseResultTable({ result }: { result: SessionFileDatabaseQueryResult }) {
  return (
    <div className="data-table-wrap file-database-results">
      <table className="data-table">
        <thead><tr><th className="data-row-number">#</th>{result.columns.map((column) => <th key={column.key}>{column.name}<small>{column.declaredType}</small></th>)}</tr></thead>
        <tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}><th className="data-row-number">{rowIndex + 1}</th>{row.map((cell, columnIndex) => <td key={columnIndex}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function createTableQuery(name?: string): string {
  return name ? `SELECT * FROM "${name.replaceAll('"', '""')}" LIMIT 500` : ''
}

function formatJsonPrimitive(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function tryParseJson(text: string): { isSuccess: true, value: unknown } | { isSuccess: false } {
  try {
    return { isSuccess: true, value: JSON.parse(text) as unknown }
  } catch {
    return { isSuccess: false }
  }
}

const maximumTextSearchMatches = 5_000

function isTextViewerKind(viewerKind: string): boolean {
  return ['code', 'csv', 'json', 'markdown', 'text', 'xml'].includes(viewerKind)
}

function collectTextSearchMatches(root: HTMLElement, query: string): { ranges: Range[], isTruncated: boolean } {
  const ranges: Range[] = []
  const needle = query.toLocaleLowerCase()
  if (!needle) {
    return { ranges, isTruncated: false }
  }

  root.querySelectorAll('details').forEach((details) => { details.open = true })
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const source = node.textContent ?? ''
    const normalizedSource = source.toLocaleLowerCase()
    let matchIndex = normalizedSource.indexOf(needle)
    while (matchIndex >= 0) {
      if (ranges.length >= maximumTextSearchMatches) {
        return { ranges, isTruncated: true }
      }

      const range = document.createRange()
      range.setStart(node, matchIndex)
      range.setEnd(node, matchIndex + needle.length)
      ranges.push(range)
      matchIndex = normalizedSource.indexOf(needle, matchIndex + Math.max(needle.length, 1))
    }
    node = walker.nextNode()
  }

  return { ranges, isTruncated: false }
}

function inferViewerKind(content: SessionLiveFileContent, entry: SessionLiveFileEntry | null): string {
  const extension = (content.fileExtension || entry?.fileExtension || getExtension(content.fileName || entry?.name || '')).toLowerCase()
  const mimeType = (content.mimeType || content.contentType || entry?.mimeType || '').toLowerCase()
  if (['.json', '.geojson', '.har'].includes(extension) || mimeType.includes('json')) return 'json'
  if (['.xml', '.xaml', '.plist', '.csproj', '.props', '.targets'].includes(extension) || mimeType.includes('xml')) return 'xml'
  if (['.md', '.markdown', '.mdx'].includes(extension)) return 'markdown'
  if (extension === '.csv' || mimeType === 'text/csv') return 'csv'
  if (['.db', '.db3', '.sqlite', '.sqlite3'].includes(extension) || mimeType.includes('sqlite')) return 'sqlite'
  if (['.glb', '.gltf', '.obj', '.stl'].includes(extension)) return 'model3d'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  return content.text !== undefined ? 'code' : 'binary'
}

function getExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index < 0 ? '' : fileName.slice(index).toLowerCase()
}

function isDirectory(entry: SessionLiveFileEntry): boolean {
  return entry.kind.toLowerCase() === 'directory' || entry.kind.toLowerCase() === 'folder'
}

function sortEntries(entries: SessionLiveFileEntry[]): SessionLiveFileEntry[] {
  return [...entries].sort((left, right) => {
    const kindOrder = Number(!isDirectory(left)) - Number(!isDirectory(right))
    return kindOrder || left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })
}

function normalizePath(value: string): string {
  return value
    .trim()
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment && segment !== '.')
    .join('/')
}

function getParentPath(value: string): string {
  const normalized = normalizePath(value)
  const separatorIndex = normalized.lastIndexOf('/')
  return separatorIndex <= 0 ? '' : normalized.slice(0, separatorIndex)
}

function formatEntryDetail(entry: SessionLiveFileEntry): string {
  return isDirectory(entry)
    ? entry.relativePath
    : `${formatBytes(entry.sizeBytes ?? 0)}${entry.lastModifiedUtc ? ` · ${new Date(entry.lastModifiedUtc).toLocaleString()}` : ''}`
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B'
  }
  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
