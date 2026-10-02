import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowDown, ArrowUp, CheckCircle2, KeyRound, Loader2, PlugZap, Plus, ShieldCheck, Trash2, Volume2, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Kind = "script" | "voice" | "video";
type Mapping = {
  requestMap: Record<string, string>;
  responseMap: { idPath: string; statusPath: string; progressPath?: string; outputUrlPath?: string; errorPath?: string };
  statusMap: { queued: string[]; running: string[]; completed: string[]; failed: string[] };
  capabilities: { aspectRatios: "9:16"[]; minDurationSeconds: number; maxDurationSeconds: number; maxReferenceImages: number; supportsSeed: boolean; supportsNegativePrompt: boolean; supportsNativeAudio: boolean };
};

type SetupForm = {
  providerKey?: string;
  kind: Kind;
  preset: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  mapping: Mapping;
};

type Connection = Omit<SetupForm, "apiKey" | "baseUrl" | "mapping"> & {
  providerKey: string;
  submitUrl: string;
  requestMap: Mapping["requestMap"];
  responseMap: Mapping["responseMap"];
  statusMap: Mapping["statusMap"];
  capabilities: Mapping["capabilities"];
  hasApiKey: boolean;
};

type VideoRow = {
  id: string;
  label: string;
  enabled: boolean;
  priority: number;
  available: boolean;
  unavailableReason?: string;
  editable: boolean;
  connection: Connection | null;
};

const initialMapping = (): Mapping => ({
  requestMap: { prompt: "input.prompt", negativePrompt: "input.negative_prompt", referenceImages: "input.reference_images", durationSeconds: "input.duration", aspectRatio: "input.aspect_ratio", width: "", height: "", seed: "input.seed", settings: "input.settings" },
  responseMap: { idPath: "id", statusPath: "status", progressPath: "progress", outputUrlPath: "output_url", errorPath: "error" },
  statusMap: { queued: ["queued", "pending", "created"], running: ["running", "processing", "in_progress"], completed: ["completed", "succeeded", "done"], failed: ["failed", "error", "canceled"] },
  capabilities: { aspectRatios: ["9:16"], minDurationSeconds: 1, maxDurationSeconds: 12, maxReferenceImages: 4, supportsSeed: true, supportsNegativePrompt: true, supportsNativeAudio: false },
});

const emptyForm = (kind: Kind): SetupForm => ({
  kind,
  preset: kind === "video" ? "custom-json" : kind === "script" ? "openrouter" : "elevenlabs",
  label: kind === "video" ? "My video provider" : "",
  baseUrl: "",
  apiKey: "",
  model: "",
  mapping: initialMapping(),
});

const csv = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);

export default function Providers() {
  const utils = trpc.useUtils();
  const presetQuery = trpc.providers.presets.useQuery();
  const settingsQuery = trpc.providers.settings.useQuery();
  const videoQuery = trpc.providers.list.useQuery();
  const [script, setScript] = useState<SetupForm>(() => emptyForm("script"));
  const [voice, setVoice] = useState<SetupForm>(() => emptyForm("voice"));
  const [video, setVideo] = useState<SetupForm>(() => emptyForm("video"));
  const [videoRows, setVideoRows] = useState<VideoRow[]>([]);

  useEffect(() => {
    if (videoQuery.data) setVideoRows(videoQuery.data as VideoRow[]);
  }, [videoQuery.data]);

  useEffect(() => {
    if (!settingsQuery.data) return;
    const saved = settingsQuery.data as Connection[];
    const hydrate = (kind: Kind, setForm: (value: SetupForm) => void) => {
      const connection = saved.find(item => item.kind === kind);
      if (!connection) return;
      setForm({
        providerKey: connection.providerKey,
        kind,
        preset: connection.preset,
        label: connection.label,
        baseUrl: connection.submitUrl,
        apiKey: "",
        model: connection.model ?? "",
        mapping: { requestMap: connection.requestMap, responseMap: connection.responseMap, statusMap: connection.statusMap, capabilities: connection.capabilities },
      });
    };
    hydrate("script", setScript);
    hydrate("voice", setVoice);
  }, [settingsQuery.data]);

  const refresh = async () => {
    await Promise.all([utils.providers.settings.invalidate(), utils.providers.list.invalidate()]);
  };
  const saveSetup = trpc.providers.saveSetup.useMutation({ onSuccess: async () => { toast.success("Provider settings saved securely"); await refresh(); }, onError: error => toast.error(error.message) });
  const testSetup = trpc.providers.testSetup.useMutation({ onSuccess: result => toast.success(result.message), onError: error => toast.error(error.message) });
  const remove = trpc.providers.remove.useMutation({ onSuccess: async () => { toast.success("Video provider removed"); await refresh(); }, onError: error => toast.error(error.message) });
  const saveOrder = trpc.providers.saveOrder.useMutation({ onSuccess: async () => { toast.success("Fallback order saved"); await refresh(); }, onError: error => toast.error(error.message) });

  const presets = useMemo(() => (presetQuery.data ?? []) as Array<{ id: string; label: string; kind: Kind; baseUrl: string; customBaseUrl?: boolean; docsUrl: string }>, [presetQuery.data]);
  const presetFor = (form: SetupForm) => presets.find(item => item.kind === form.kind && item.id === form.preset);
  const applyPreset = (form: SetupForm, setForm: (value: SetupForm) => void, preset: string) => {
    const selected = presets.find(item => item.id === preset && item.kind === form.kind);
    setForm({ ...form, preset, baseUrl: selected?.baseUrl ?? "" });
  };
  const updateMapping = (form: SetupForm, setForm: (value: SetupForm) => void, path: "requestMap" | "responseMap", key: string, value: string) => {
    setForm({ ...form, mapping: { ...form.mapping, [path]: { ...form.mapping[path], [key]: value } } });
  };
  const move = (index: number, direction: -1 | 1) => setVideoRows(rows => {
    const next = [...rows];
    const target = index + direction;
    if (target < 0 || target >= next.length) return rows;
    [next[index], next[target]] = [next[target]!, next[index]!];
    return next.map((item, priority) => ({ ...item, priority }));
  });
  const editVideo = (connection: Connection) => setVideo({
    providerKey: connection.providerKey,
    kind: "video",
    preset: connection.preset,
    label: connection.label,
    baseUrl: connection.submitUrl,
    apiKey: "",
    model: connection.model ?? "",
    mapping: { requestMap: connection.requestMap, responseMap: connection.responseMap, statusMap: connection.statusMap, capabilities: connection.capabilities },
  });
  const clearVideo = () => setVideo(emptyForm("video"));

  const SettingsCard = ({ form, setForm, title, description, icon: Icon }: { form: SetupForm; setForm: (value: SetupForm) => void; title: string; description: string; icon: typeof WandSparkles }) => {
    const selected = presetFor(form);
    const needsCustomUrl = selected?.customBaseUrl;
    return <Card className="border-white/[.07] bg-card/70"><CardContent className="p-5 sm:p-7">
      <div className="flex items-start gap-3"><div className="mt-0.5 rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div><div><p className="eyebrow">{form.kind === "script" ? "Story planning" : "Audio setup"}</p><h2 className="mt-1 font-display text-3xl">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Provider preset"><Select value={form.preset} onValueChange={preset => applyPreset(form, setForm, preset)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{presets.filter(item => item.kind === form.kind).map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={form.kind === "voice" && form.preset === "elevenlabs" ? "Voice ID" : "Model"}><Input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} placeholder={form.kind === "voice" && form.preset === "elevenlabs" ? "Your ElevenLabs voice ID" : "Provider model ID"} /></Field>
        {needsCustomUrl && <Field label="Custom API base URL"><Input value={form.baseUrl} onChange={event => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" inputMode="url" /></Field>}
        <Field label={form.providerKey ? "Replace API key (optional)" : "API key"}><Input type="password" autoComplete="new-password" value={form.apiKey} onChange={event => setForm({ ...form, apiKey: event.target.value })} placeholder={form.providerKey ? "Leave blank to retain saved key" : "Stored encrypted and never shown again"} /></Field>
      </div>
      {selected?.docsUrl && <a className="mt-3 inline-block text-xs text-primary hover:underline" href={selected.docsUrl} target="_blank" rel="noreferrer">Official API documentation</a>}
      <div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => saveSetup.mutate(form)} disabled={saveSetup.isPending}>{saveSetup.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Save securely</Button><Button variant="outline" className="bg-white/[.02]" onClick={() => testSetup.mutate(form)} disabled={testSetup.isPending}>{testSetup.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}Test connection</Button></div>
    </CardContent></Card>;
  };

  return <DashboardLayout><div className="mx-auto max-w-5xl space-y-6">
    <section className="rounded-[2rem] border border-white/[.07] bg-card/70 p-6 sm:p-9"><p className="eyebrow">Owner-only connections</p><h1 className="mt-2 font-display text-5xl">Provider settings</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Choose a preset, enter a model and key, then test it. Keys are encrypted server-side and never displayed after saving.</p></section>
    <SettingsCard form={script} setForm={setScript} title="Script writer" description="Creates your multi-clip creative plan through an OpenAI-compatible endpoint. Choose OpenRouter, Kimi, Fireworks, OpenAI, or a custom compatible service." icon={WandSparkles} />
    <SettingsCard form={voice} setForm={setVoice} title="Voice (text-to-speech)" description="Stores and tests a voice provider for a future audio track. It does not alter the current video-only export flow." icon={Volume2} />

    <Card className="border-white/[.07] bg-card/70"><CardContent className="p-5 sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Video clips</p><h2 className="mt-2 font-display text-3xl">Custom JSON video provider</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Keep the generic adapter for any asynchronous video API. Add one connection per renderer, then set its fallback priority below.</p></div><Button variant="outline" className="bg-white/[.02]" onClick={clearVideo}><Plus className="mr-2 h-4 w-4" />New provider</Button></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Provider name"><Input value={video.label} onChange={event => setVideo({ ...video, label: event.target.value })} placeholder="My video renderer" /></Field><Field label="Model ID"><Input value={video.model} onChange={event => setVideo({ ...video, model: event.target.value })} placeholder="Provider model ID" /></Field><Field label="Submit URL"><Input value={video.baseUrl} onChange={event => setVideo({ ...video, baseUrl: event.target.value })} placeholder="https://api.example.com/jobs" inputMode="url" /></Field><Field label={video.providerKey ? "Replace API key (optional)" : "API key"}><Input type="password" autoComplete="new-password" value={video.apiKey} onChange={event => setVideo({ ...video, apiKey: event.target.value })} placeholder={video.providerKey ? "Leave blank to retain saved key" : "Stored encrypted and never shown again"} /></Field></div>
      <details className="mt-5 rounded-2xl border border-white/[.07] bg-black/15 p-4"><summary className="cursor-pointer font-semibold">Custom request and response mapping</summary><p className="mt-3 text-xs leading-5 text-muted-foreground">Use field paths from this renderer’s API documentation. These mappings are only for the generic Custom JSON video option.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Prompt path"><Input value={video.mapping.requestMap.prompt ?? ""} onChange={event => updateMapping(video, setVideo, "requestMap", "prompt", event.target.value)} /></Field><Field label="Reference images path"><Input value={video.mapping.requestMap.referenceImages ?? ""} onChange={event => updateMapping(video, setVideo, "requestMap", "referenceImages", event.target.value)} /></Field><Field label="Duration path"><Input value={video.mapping.requestMap.durationSeconds ?? ""} onChange={event => updateMapping(video, setVideo, "requestMap", "durationSeconds", event.target.value)} /></Field><Field label="Aspect-ratio path"><Input value={video.mapping.requestMap.aspectRatio ?? ""} onChange={event => updateMapping(video, setVideo, "requestMap", "aspectRatio", event.target.value)} /></Field><Field label="Job ID response path"><Input value={video.mapping.responseMap.idPath} onChange={event => updateMapping(video, setVideo, "responseMap", "idPath", event.target.value)} /></Field><Field label="Status response path"><Input value={video.mapping.responseMap.statusPath} onChange={event => updateMapping(video, setVideo, "responseMap", "statusPath", event.target.value)} /></Field><Field label="Progress response path"><Input value={video.mapping.responseMap.progressPath ?? ""} onChange={event => updateMapping(video, setVideo, "responseMap", "progressPath", event.target.value)} /></Field><Field label="Output URL response path"><Input value={video.mapping.responseMap.outputUrlPath ?? ""} onChange={event => updateMapping(video, setVideo, "responseMap", "outputUrlPath", event.target.value)} /></Field></div></details>
      <div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => saveSetup.mutate(video)} disabled={saveSetup.isPending || !video.label || !video.baseUrl}>{saveSetup.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}{video.providerKey ? "Save video provider" : "Connect video provider"}</Button><Button variant="outline" className="bg-white/[.02]" onClick={() => testSetup.mutate(video)} disabled={testSetup.isPending || !video.baseUrl}>{testSetup.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}Test connection</Button></div>
    </CardContent></Card>

    <Card className="border-white/[.07] bg-card/70"><CardContent className="p-5 sm:p-7"><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Priority order</p><h2 className="mt-2 font-display text-3xl">Primary and fallbacks</h2></div><Button variant="outline" className="bg-white/[.02]" disabled={saveOrder.isPending || !videoRows.length} onClick={() => saveOrder.mutate({ providers: videoRows.map(row => ({ providerKey: row.id, label: row.label, enabled: row.enabled })) })}>{saveOrder.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Save order</Button></div>
      {videoQuery.isLoading ? <div className="grid min-h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : videoRows.length ? <div className="space-y-3">{videoRows.map((provider, index) => <div key={provider.id} className="grid gap-4 rounded-2xl border border-white/[.06] bg-black/15 p-4 sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:items-center"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 font-display text-xl text-primary">{index + 1}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{provider.label}</h3>{index === 0 && provider.enabled && <Badge className="bg-primary/10 text-primary">Primary</Badge>}<Badge variant="outline" className={provider.available ? "border-emerald-400/20 text-emerald-200" : "border-amber-400/20 text-amber-200"}>{provider.available ? "Ready" : "Needs attention"}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{provider.connection?.model || "No model ID"} · {provider.connection?.submitUrl || provider.id}</p>{provider.unavailableReason && <p className="mt-1 text-xs text-amber-200/75">{provider.unavailableReason}</p>}</div><div className="flex items-center justify-end gap-1"><Switch checked={provider.enabled} onCheckedChange={enabled => setVideoRows(rows => rows.map(row => row.id === provider.id ? { ...row, enabled } : row))} /><Button size="icon" variant="ghost" onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => move(index, 1)} disabled={index === videoRows.length - 1}><ArrowDown className="h-4 w-4" /></Button>{provider.connection && <Button size="icon" variant="ghost" onClick={() => editVideo(provider.connection!)}><KeyRound className="h-4 w-4" /></Button>}<Button size="icon" variant="ghost" className="text-red-200 hover:text-red-100" onClick={() => { if (window.confirm(`Remove ${provider.label}? Existing job history will remain.`)) remove.mutate({ providerKey: provider.id }); }}><Trash2 className="h-4 w-4" /></Button></div></div>)}</div> : <div className="rounded-3xl border border-dashed border-primary/20 bg-primary/[.025] p-8 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-primary" /><h3 className="mt-4 font-display text-2xl">No video renderer connected</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Add a Custom JSON video provider above, then set its mappings and fallback order here.</p></div>}
    </CardContent></Card>
  </div></DashboardLayout>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
