import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';

const token = new URLSearchParams(location.search).get('token')!;
let iframe = document.querySelector<HTMLIFrameElement>('#widget')!;
const select = document.querySelector<HTMLSelectElement>('#sessions')!;
const status = document.querySelector<HTMLElement>('#status')!;
const context = document.querySelector<HTMLElement>('#context')!;
let bridge: AppBridge | undefined;
function connectBridge() {
const active = new AppBridge(null, { name: 'Ansight local preview', version: '0.2.0' },
  { serverTools: {}, logging: {}, updateModelContext: {}, message: { text: {} }, openLinks: {} },
  { hostContext: { theme: 'light', displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] } });
return active;
}

async function call(name: string, args: Record<string, unknown>) {
  const response = await fetch(`/tool?token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, arguments: args }),
  });
  if (!response.ok) throw new Error(`Preview request failed: ${response.status}`);
  return response.json();
}
async function load() {
  if (!select.value) return;
  const button = document.querySelector<HTMLButtonElement>('#load')!;
  button.disabled = true;
  try {
    status.textContent = 'Loading capture…';
    const sessionId = select.value;
    const result = await call('show_replay', { sessionId });
    if (result.isError) throw new Error(result.content[0].text);
    await bridge?.close();
    const replacement = document.createElement('iframe');
    replacement.id = 'widget'; replacement.title = 'Ansight replay widget';
    replacement.setAttribute('sandbox', 'allow-scripts');
    iframe.replaceWith(replacement); iframe = replacement;
    const active = connectBridge(); bridge = active;
    let inlineHeight = 800;
    let fullscreen = false;
    active.oncalltool = params => call(params.name, params.arguments ?? {});
    active.onopenlink = async ({ url }) => {
      if (url !== result._meta.replay.fullReplayUrl) return { isError: true };
      window.open(url, '_blank', 'noopener,noreferrer');
      return {};
    };
    active.onsizechange = ({ height }) => {
      if (!fullscreen && typeof height === 'number') {
        inlineHeight = height;
        replacement.style.height = `${height}px`;
      }
    };
    active.onupdatemodelcontext = async params => { context.textContent = JSON.stringify(params, null, 2); return {}; };
    active.onmessage = async params => { context.textContent = `Preview only — no chat message was sent.\n${JSON.stringify(params, null, 2)}`; return {}; };
    active.onrequestdisplaymode = async ({ mode }) => {
      fullscreen = mode === 'fullscreen';
      document.body.classList.toggle('fullscreen', fullscreen);
      replacement.style.height = fullscreen ? '100dvh' : `${inlineHeight}px`;
      active.setHostContext({ theme: 'light', displayMode: mode, availableDisplayModes: ['inline', 'fullscreen'] });
      return { mode };
    };
    active.oninitialized = () => {
      void (async () => {
        await active.sendToolInput({ arguments: { sessionId } });
        await active.sendToolResult(result);
        status.textContent = `Connected · ${result.structuredContent.title}`;
      })().catch(error => { status.textContent = String(error); });
    };
    await active.connect(new PostMessageTransport(replacement.contentWindow!, replacement.contentWindow!));
    replacement.src = `/widget?token=${encodeURIComponent(token)}`;
  } catch (error) { status.textContent = String(error); }
  finally { button.disabled = false; }
}
document.querySelector('#load')!.addEventListener('click', load);
async function start() {
  const result = await call('list_replays', { limit: 20 });
  if (result.isError) throw new Error(result.content[0].text);
  for (const session of result.structuredContent.sessions) {
    const option = document.createElement('option'); option.value = session.sessionId;
    option.textContent = session.title; select.append(option);
  }
  if (!select.options.length) { status.textContent = 'No local captures found.'; return; }
  const requested = new URLSearchParams(location.search).get('sessionId');
  if (requested && [...select.options].some(option => option.value === requested)) select.value = requested;
  await load();
}
void start().catch(error => { status.textContent = String(error); });
