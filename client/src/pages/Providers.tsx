import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowDown, ArrowUp, CheckCircle2, KeyRound, Loader2, Pencil, PlugZap, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";

type ConnectionConfig = {
  providerKey: string; label: string; adapterType: string; submitUrl: string; statusUrlTemplate: string | null;
  apiKeyHeader: string; apiKeyPrefix: string; hasApiKey: boolean; model: string | null; modelField: string | null;
  headers: Record<string, string>;
  requestMap: Partial<Record<"prompt" | "negativePrompt" | "referenceImages" | "durationSeconds" | "aspectRatio" | "width" | "height" | "seed" | "settings", string>>;
  responseMap: { idPath: string; statusPath: string; progressPath?: string; outputUrlPath?: string; errorPath?: string };
  statusMap?: Partial<Record<"queued" | "running" | "completed" | "failed", string[]>>;
  capabilities: { aspectRatios: "9:16"[]; minDurationSeconds: number; maxDurationSeconds: number; maxReferenceImages: number; supportsSeed: boolean; supportsNegativePrompt: boolean; supportsNativeAudio: boolean };
};

type ProviderRow = {
  id: string; label: string; enabled: boolean; priority: number; available: boolean; configured: boolean;
  unavailableReason?: string; editable: boolean; connection: ConnectionConfig | null;
};

const initialForm = {
  label: "", submitUrl: "", statusUrlTemplate: "", apiKey: "", apiKeyHeader: "Authorization", apiKeyPrefix: "Bearer ",
  model: "", modelField: "model", headersJson: "{}",
  promptPath: "input.prompt", negativePromptPath: "input.negative_prompt", referenceImagesPath: "input.reference_images",
  durationPath: "input.duration", aspectRatioPath: "input.aspect_ratio", seedPath: "input.seed", settingsPath: "input.settings",
  idPath: "id", statusPath: "status", progressPath: "progress", outputPath: "output_url", errorPath: "error",
  queuedStates: "queued,pending,created", runningStates: "running,processing,in_progress", completedStates: "completed,succeeded,done", failedStates: "failed,error,canceled",
  minDuration: 1, maxDuration: 12, maxReferences: 4, supportsSeed: true, supportsNegativePrompt: true, supportsNativeAudio: false,
};

const states = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);

export default function Providers() {
  const utils = trpc.useUtils();
  const search = useSearch();
  const promptedOnEmpty = useRef(false);
  const query = trpc.providers.list.useQuery();
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get("add") === "1");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  useEffect(() => { if (query.data) setRows(query.data as ProviderRow[]); }, [query.data]);
  useEffect(() => { if (new URLSearchParams(search).get("add") === "1") setOpen(true); }, [search]);
  useEffect(() => {
    if (!query.isLoading && query.data?.length === 0 && !promptedOnEmpty.current) {
      promptedOnEmpty.current = true;
      setOpen(true);
    }
  }, [query.data, query.isLoading]);

  const refresh = async () => { await utils.providers.list.invalidate(); };
  const saveOrder = trpc.providers.saveOrder.useMutation({ onSuccess: () => { toast.success("Provider chain saved"); refresh(); }, onError: error => toast.error(error.message) });
  const create = trpc.providers.create.useMutation({ onSuccess: () => { toast.success("Provider connected securely"); setOpen(false); refresh(); }, onError: error => toast.error(error.message) });
  const update = trpc.providers.update.useMutation({ onSuccess: () => { toast.success("Provider updated"); setOpen(false); refresh(); }, onError: error => toast.error(error.message) });
  const remove = trpc.providers.remove.useMutation({ onSuccess: () => { toast.success("Provider removed"); refresh(); }, onError: error => toast.error(error.message) });
  const pending = create.isPending || update.isPending;

  const move = (index: number, direction: -1 | 1) => setRows(current => {
    const next = [...current]; const target = index + direction;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target]!, next[index]!];
    return next.map((item, priority) => ({ ...item, priority }));
  });

  const openCreate = () => { setEditingKey(null); setForm(initialForm); setOpen(true); };
  const openEdit = (provider: ProviderRow) => {
    const connection = provider.connection;
    if (!connection) return;
    setEditingKey(provider.id);
    setForm({
      ...initialForm,
      label: connection.label, submitUrl: connection.submitUrl, statusUrlTemplate: connection.statusUrlTemplate ?? "",
      apiKey: "", apiKeyHeader: connection.apiKeyHeader, apiKeyPrefix: connection.apiKeyPrefix,
      model: connection.model ?? "", modelField: connection.modelField ?? "", headersJson: JSON.stringify(connection.headers, null, 2),
      promptPath: connection.requestMap.prompt ?? "", negativePromptPath: connection.requestMap.negativePrompt ?? "",
      referenceImagesPath: connection.requestMap.referenceImages ?? "", durationPath: connection.requestMap.durationSeconds ?? "",
      aspectRatioPath: connection.requestMap.aspectRatio ?? "", seedPath: connection.requestMap.seed ?? "", settingsPath: connection.requestMap.settings ?? "",
      idPath: connection.responseMap.idPath, statusPath: connection.responseMap.statusPath,
      progressPath: connection.responseMap.progressPath ?? "", outputPath: connection.responseMap.outputUrlPath ?? "", errorPath: connection.responseMap.errorPath ?? "",
      queuedStates: (connection.statusMap?.queued ?? []).join(","), runningStates: (connection.statusMap?.running ?? []).join(","),
      completedStates: (connection.statusMap?.completed ?? []).join(","), failedStates: (connection.statusMap?.failed ?? []).join(","),
      minDuration: connection.capabilities.minDurationSeconds, maxDuration: connection.capabilities.maxDurationSeconds,
      maxReferences: connection.capabilities.maxReferenceImages, supportsSeed: connection.capabilities.supportsSeed,
      supportsNegativePrompt: connection.capabilities.supportsNegativePrompt, supportsNativeAudio: connection.capabilities.supportsNativeAudio,
    });
    setOpen(true);
  };

  const submitConnection = () => {
    let headers: Record<string, string> = {};
    try { headers = JSON.parse(form.headersJson || "{}"); } catch { toast.error("Extra headers must be valid JSON."); return; }
    if (!editingKey && !form.apiKey) { toast.error("Enter the provider API key."); return; }
    const payload = {
      label: form.label, submitUrl: form.submitUrl, statusUrlTemplate: form.statusUrlTemplate,
      apiKeyHeader: form.apiKeyHeader, apiKeyPrefix: form.apiKeyPrefix, model: form.model, modelField: form.modelField, headers,
      requestMap: { prompt: form.promptPath, negativePrompt: form.negativePromptPath, referenceImages: form.referenceImagesPath, durationSeconds: form.durationPath, aspectRatio: form.aspectRatioPath, width: "", height: "", seed: form.seedPath, settings: form.settingsPath },
      responseMap: { idPath: form.idPath, statusPath: form.statusPath, progressPath: form.progressPath, outputUrlPath: form.outputPath, errorPath: form.errorPath },
      statusMap: { queued: states(form.queuedStates), running: states(form.runningStates), completed: states(form.completedStates), failed: states(form.failedStates) },
      capabilities: { aspectRatios: ["9:16" as const], minDurationSeconds: form.minDuration, maxDurationSeconds: form.maxDuration, maxReferenceImages: form.maxReferences, supportsSeed: form.supportsSeed, supportsNegativePrompt: form.supportsNegativePrompt, supportsNativeAudio: form.supportsNativeAudio },
    };
    if (editingKey) update.mutate({ ...payload, providerKey: editingKey, apiKey: form.apiKey || undefined });
    else create.mutate({ ...payload, apiKey: form.apiKey });
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[2rem] border border-white/[.07] bg-card/70 p-6 sm:p-9">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="eyebrow">Owner-only connections</p><h1 className="mt-2 font-display text-5xl">Video provider chain</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Add any asynchronous JSON video API, choose its model, and map the shared FrameForge fields to that provider. Keys are encrypted on the server and never shown again.</p></div>
            <Button size="lg" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add provider</Button>
          </div>
        </section>

        <Card className="border-white/[.07] bg-card/70"><CardContent className="p-5 sm:p-7">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Priority order</p><h2 className="mt-2 font-display text-3xl">Primary and fallbacks</h2></div><Button variant="outline" className="bg-white/[.02]" disabled={saveOrder.isPending || !rows.length} onClick={() => saveOrder.mutate({ providers: rows.map(row => ({ providerKey: row.id, label: row.label, enabled: row.enabled })) })}>{saveOrder.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Save order</Button></div>
          {query.isLoading ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : rows.length ? <div className="space-y-3">{rows.map((provider, index) => (
            <div key={provider.id} className="grid gap-4 rounded-2xl border border-white/[.06] bg-black/15 p-4 sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:items-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 font-display text-xl text-primary">{index + 1}</div>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{provider.label}</h3>{index === 0 && provider.enabled && <Badge className="bg-primary/10 text-primary">Primary</Badge>}<Badge variant="outline" className={provider.available ? "border-emerald-400/20 text-emerald-200" : "border-amber-400/20 text-amber-200"}>{provider.available ? "Ready" : "Needs attention"}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{provider.connection?.model || "No model ID"} · {provider.connection?.submitUrl || provider.id}</p>{provider.unavailableReason && <p className="mt-1 text-xs text-amber-200/75">{provider.unavailableReason}</p>}</div>
              <div className="flex items-center justify-end gap-1"><Switch checked={provider.enabled} onCheckedChange={enabled => setRows(current => current.map(item => item.id === provider.id ? { ...item, enabled } : item))} /><Button size="icon" variant="ghost" onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => move(index, 1)} disabled={index === rows.length - 1}><ArrowDown className="h-4 w-4" /></Button>{provider.editable && <Button size="icon" variant="ghost" onClick={() => openEdit(provider)}><Pencil className="h-4 w-4" /></Button>}{provider.editable && <Button size="icon" variant="ghost" className="text-red-200 hover:text-red-100" onClick={() => { if (window.confirm(`Remove ${provider.label}? Existing job history will remain.`)) remove.mutate({ providerKey: provider.id }); }}><Trash2 className="h-4 w-4" /></Button>}</div>
            </div>
          ))}</div> : <div className="rounded-3xl border border-dashed border-primary/20 bg-primary/[.025] p-8 text-center sm:p-12"><KeyRound className="mx-auto h-8 w-8 text-primary" /><h3 className="mt-5 font-display text-3xl">Connect your first renderer</h3><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Enter the provider's model ID, job endpoints, and API key here. You no longer need to edit a hidden server variable.</p><Button className="mt-6" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add video provider</Button></div>}
        </CardContent></Card>

        <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-3xl border border-white/[.07] bg-card/55 p-5"><CheckCircle2 className="h-5 w-5 text-emerald-300" /><h3 className="mt-4 font-semibold">Automatic fallback</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">The first enabled entry is primary. Quota, credit, rate-limit, unavailable, and retryable failures can advance to the next provider.</p></div><div className="rounded-3xl border border-white/[.07] bg-card/55 p-5"><ShieldCheck className="h-5 w-5 text-primary" /><h3 className="mt-4 font-semibold">Credential isolation</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">API keys are encrypted before database storage. Editing shows a blank replacement field, never the saved key.</p></div></div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto border-white/10 bg-popover p-0">
          <DialogHeader className="border-b border-white/[.07] p-6 sm:p-7"><DialogTitle className="font-display text-3xl">{editingKey ? "Edit video provider" : "Add video provider"}</DialogTitle><DialogDescription>Use the field names from your provider's API documentation. The defaults match many asynchronous JSON job APIs.</DialogDescription></DialogHeader>
          <div className="space-y-7 p-6 sm:p-7">
            <section className="space-y-4"><p className="eyebrow">Connection</p><div className="grid gap-4 sm:grid-cols-2"><Field label="Provider name"><Input value={form.label} onChange={event => setForm({ ...form, label: event.target.value })} placeholder="My video renderer" /></Field><Field label="Model ID"><Input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} placeholder="provider/model-name" /></Field></div><Field label="Submit endpoint"><Input value={form.submitUrl} onChange={event => setForm({ ...form, submitUrl: event.target.value })} placeholder="https://api.provider.com/v1/video/jobs" inputMode="url" /></Field><Field label="Status endpoint"><Input value={form.statusUrlTemplate} onChange={event => setForm({ ...form, statusUrlTemplate: event.target.value })} placeholder="https://api.provider.com/v1/video/jobs/{id}" inputMode="url" /><p className="text-xs text-muted-foreground">Use <code className="text-primary">{"{id}"}</code> where the remote job ID belongs.</p></Field><div className="grid gap-4 sm:grid-cols-[1fr_.65fr_.65fr]"><Field label={editingKey ? "Replace API key (optional)" : "API key"}><Input type="password" autoComplete="new-password" value={form.apiKey} onChange={event => setForm({ ...form, apiKey: event.target.value })} placeholder={editingKey ? "Leave blank to keep saved key" : "Stored encrypted on the server"} /></Field><Field label="Key header"><Input value={form.apiKeyHeader} onChange={event => setForm({ ...form, apiKeyHeader: event.target.value })} /></Field><Field label="Key prefix"><Input value={form.apiKeyPrefix} onChange={event => setForm({ ...form, apiKeyPrefix: event.target.value })} placeholder="Bearer " /></Field></div></section>

            <details className="rounded-2xl border border-white/[.07] bg-black/15 p-4"><summary className="cursor-pointer font-semibold">Advanced request and response mapping</summary><div className="mt-5 space-y-5"><p className="text-xs leading-5 text-muted-foreground">Paths such as <code className="text-primary">input.prompt</code> create nested request fields. Response paths read nested values such as <code className="text-primary">data.task.id</code>.</p><div className="grid gap-4 sm:grid-cols-2"><Field label="Prompt path"><Input value={form.promptPath} onChange={event => setForm({ ...form, promptPath: event.target.value })} /></Field><Field label="Reference images path"><Input value={form.referenceImagesPath} onChange={event => setForm({ ...form, referenceImagesPath: event.target.value })} /></Field><Field label="Duration path"><Input value={form.durationPath} onChange={event => setForm({ ...form, durationPath: event.target.value })} /></Field><Field label="Aspect ratio path"><Input value={form.aspectRatioPath} onChange={event => setForm({ ...form, aspectRatioPath: event.target.value })} /></Field><Field label="Negative prompt path"><Input value={form.negativePromptPath} onChange={event => setForm({ ...form, negativePromptPath: event.target.value })} /></Field><Field label="Seed path"><Input value={form.seedPath} onChange={event => setForm({ ...form, seedPath: event.target.value })} /></Field><Field label="Model path"><Input value={form.modelField} onChange={event => setForm({ ...form, modelField: event.target.value })} /></Field><Field label="Settings path"><Input value={form.settingsPath} onChange={event => setForm({ ...form, settingsPath: event.target.value })} /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Job ID response path"><Input value={form.idPath} onChange={event => setForm({ ...form, idPath: event.target.value })} /></Field><Field label="Status response path"><Input value={form.statusPath} onChange={event => setForm({ ...form, statusPath: event.target.value })} /></Field><Field label="Progress response path"><Input value={form.progressPath} onChange={event => setForm({ ...form, progressPath: event.target.value })} /></Field><Field label="Output URL response path"><Input value={form.outputPath} onChange={event => setForm({ ...form, outputPath: event.target.value })} /></Field><Field label="Error response path"><Input value={form.errorPath} onChange={event => setForm({ ...form, errorPath: event.target.value })} /></Field></div><Field label="Additional headers as JSON"><Textarea value={form.headersJson} onChange={event => setForm({ ...form, headersJson: event.target.value })} className="min-h-24 font-mono text-xs" /></Field></div></details>

            <details className="rounded-2xl border border-white/[.07] bg-black/15 p-4"><summary className="cursor-pointer font-semibold">Status values and capabilities</summary><div className="mt-5 space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Queued values"><Input value={form.queuedStates} onChange={event => setForm({ ...form, queuedStates: event.target.value })} /></Field><Field label="Running values"><Input value={form.runningStates} onChange={event => setForm({ ...form, runningStates: event.target.value })} /></Field><Field label="Completed values"><Input value={form.completedStates} onChange={event => setForm({ ...form, completedStates: event.target.value })} /></Field><Field label="Failed values"><Input value={form.failedStates} onChange={event => setForm({ ...form, failedStates: event.target.value })} /></Field></div><div className="grid grid-cols-3 gap-3"><Field label="Minimum clip"><Input type="number" min={1} max={60} value={form.minDuration} onChange={event => setForm({ ...form, minDuration: Number(event.target.value) })} /></Field><Field label="Maximum clip"><Input type="number" min={1} max={60} value={form.maxDuration} onChange={event => setForm({ ...form, maxDuration: Number(event.target.value) })} /></Field><Field label="Max references"><Input type="number" min={0} max={20} value={form.maxReferences} onChange={event => setForm({ ...form, maxReferences: Number(event.target.value) })} /></Field></div><div className="space-y-3"><ToggleRow label="Supports deterministic seed" checked={form.supportsSeed} onChange={checked => setForm({ ...form, supportsSeed: checked })} /><ToggleRow label="Supports negative prompts" checked={form.supportsNegativePrompt} onChange={checked => setForm({ ...form, supportsNegativePrompt: checked })} /><ToggleRow label="Generates native audio" checked={form.supportsNativeAudio} onChange={checked => setForm({ ...form, supportsNativeAudio: checked })} /></div></div></details>

            <div className="flex flex-col-reverse gap-2 border-t border-white/[.07] pt-5 sm:flex-row sm:justify-end"><Button variant="outline" className="bg-white/[.02]" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submitConnection} disabled={pending || !form.label || !form.submitUrl || !form.idPath || !form.statusPath}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}{editingKey ? "Save provider" : "Connect provider"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[.06] bg-white/[.02] px-3 py-2"><span className="text-sm">{label}</span><Switch checked={checked} onCheckedChange={onChange} /></div>;
}
