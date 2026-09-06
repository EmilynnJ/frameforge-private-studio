import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowDown, ArrowLeft, ArrowUp, Check, CircleAlert, Clock3, Copy, Download, ImagePlus, Loader2, Play, RefreshCw, Sparkles, Upload, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

type LocalClip = { id: number; sequence: number; title: string; prompt: string; durationSeconds: number; status: string; providerKey: string | null };

const statusIcon = (status: string) => status === "completed" ? <Check className="h-3.5 w-3.5" /> : status === "failed" ? <CircleAlert className="h-3.5 w-3.5" /> : status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock3 className="h-3.5 w-3.5" />;

export default function ProjectStudio() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const [, navigate] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const bundle = trpc.studio.get.useQuery({ projectId }, { enabled: Number.isFinite(projectId), refetchInterval: query => {
    const data = query.state.data;
    return data?.jobs.some(job => job.status === "queued" || job.status === "running") ? 6000 : false;
  }});
  const providers = trpc.providers.list.useQuery();
  const [timeline, setTimeline] = useState<LocalClip[]>([]);
  useEffect(() => { if (bundle.data?.clips) setTimeline(bundle.data.clips); }, [bundle.data?.clips]);
  const total = useMemo(() => timeline.reduce((sum, clip) => sum + clip.durationSeconds, 0), [timeline]);

  const invalidate = () => utils.studio.get.invalidate({ projectId });
  const upload = trpc.studio.uploadReference.useMutation({ onSuccess: () => { toast.success("Reference added"); invalidate(); }, onError: error => toast.error(error.message) });
  const plan = trpc.studio.plan.useMutation({ onSuccess: result => { toast.success(`${result.clips.length} scenes planned`); invalidate(); }, onError: error => toast.error(error.message) });
  const submit = trpc.generation.submitProject.useMutation({ onSuccess: () => { toast.success("Clip jobs submitted"); invalidate(); }, onError: error => toast.error(error.message) });
  const saveTimeline = trpc.studio.updateTimeline.useMutation({ onSuccess: () => { toast.success("Timeline saved"); invalidate(); }, onError: error => toast.error(error.message) });
  const updateProject = trpc.studio.update.useMutation({ onSuccess: () => invalidate(), onError: error => toast.error(error.message) });
  const refresh = trpc.generation.refreshJob.useMutation({ onSuccess: () => invalidate(), onError: error => toast.error(error.message) });
  const assemble = trpc.exports.assemble.useMutation({ onSuccess: () => { toast.success("TikTok-ready MP4 assembled"); invalidate(); }, onError: error => toast.error(error.message) });
  const duplicate = trpc.studio.duplicate.useMutation({ onSuccess: project => { if (project) { toast.success("Reusable cut created"); navigate(`/projects/${project.id}`); } }, onError: error => toast.error(error.message) });

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.match(/^image\/(jpeg|png|webp)$/)) { toast.error(`${file.name} is not a supported image.`); continue; }
      if (file.size > 8_000_000) { toast.error(`${file.name} is larger than 8 MB.`); continue; }
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      await upload.mutateAsync({ projectId, fileName: file.name, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp", base64 });
    }
  };

  const move = (index: number, direction: -1 | 1) => setTimeline(current => {
    const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target]!, next[index]!]; return next.map((clip, idx) => ({ ...clip, sequence: idx + 1 }));
  });
  const save = () => saveTimeline.mutate({ projectId, clips: timeline.map(({ id, sequence, durationSeconds }) => ({ id, sequence, durationSeconds })) });

  if (bundle.isLoading) return <DashboardLayout><div className="grid min-h-[70vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></DashboardLayout>;
  if (!bundle.data) return <DashboardLayout><div className="rounded-3xl border border-white/10 bg-card p-10 text-center"><h1 className="font-display text-3xl">Project unavailable</h1><Button className="mt-6" onClick={() => navigate("/")}>Return to studio</Button></div></DashboardLayout>;
  const { project, assets, jobs, exports } = bundle.data;
  const refs = assets.filter(asset => asset.kind === "reference_image");
  const activeJobs = jobs.filter(job => job.kind === "video");

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1540px] space-y-5">
        <div className="flex flex-col gap-5 rounded-[2rem] border border-white/[.07] bg-card/70 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div><button onClick={() => navigate("/")} className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[.18em] text-muted-foreground hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" /> Projects</button><div className="flex flex-wrap items-center gap-3"><h1 className="font-display text-4xl sm:text-5xl">{project.name}</h1><Badge className="bg-primary/10 text-primary hover:bg-primary/10">{project.status}</Badge></div><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{project.prompt}</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" className="bg-white/[.02]" onClick={() => duplicate.mutate({ projectId })} disabled={duplicate.isPending}><Copy className="mr-2 h-4 w-4" /> Reuse as new cut</Button><Button variant="outline" className="bg-white/[.02]" onClick={() => plan.mutate({ projectId })} disabled={plan.isPending}>{plan.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{timeline.length ? "Rebuild plan" : "Generate clip plan"}</Button><Button onClick={() => submit.mutate({ projectId })} disabled={!timeline.length || submit.isPending || !providers.data?.some(provider => provider.enabled && provider.available)}><Play className="mr-2 h-4 w-4 fill-current" /> Generate all clips</Button></div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_330px]">
          <aside className="space-y-5">
            <Card className="border-white/[.07] bg-card/70"><CardContent className="p-5"><p className="eyebrow">References</p><div className="mt-4 grid grid-cols-3 gap-2">{refs.map(asset => <div key={asset.id} className="aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-black/30"><img src={asset.url} alt={asset.fileName} className="h-full w-full object-cover" /></div>)}<button onClick={() => fileRef.current?.click()} className="flex aspect-[3/4] items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[.02] text-muted-foreground hover:border-primary/40 hover:text-primary"><ImagePlus className="h-5 w-5" /></button></div><input ref={fileRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => onFiles(event.target.files)} /><Button variant="outline" className="mt-4 w-full bg-white/[.02]" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>{upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Upload references</Button><p className="mt-3 text-xs leading-5 text-muted-foreground">JPG, PNG, or WebP. Up to 8 MB each. Stored privately.</p></CardContent></Card>
            <Card className="border-white/[.07] bg-card/70"><CardContent className="p-5"><p className="eyebrow">Rendering route</p><div className="mt-4 space-y-3"><Select value={project.videoProviderMode} onValueChange={value => updateProject.mutate({ projectId, videoProviderMode: value as "automatic" | "manual", selectedVideoProviderKey: value === "automatic" ? null : project.selectedVideoProviderKey })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="automatic">Automatic fallback</SelectItem><SelectItem value="manual" disabled={!providers.data?.length}>Manual provider</SelectItem></SelectContent></Select>{project.videoProviderMode === "manual" && <Select value={project.selectedVideoProviderKey ?? ""} onValueChange={value => updateProject.mutate({ projectId, selectedVideoProviderKey: value })}><SelectTrigger><SelectValue placeholder="Choose provider" /></SelectTrigger><SelectContent>{providers.data?.map(provider => <SelectItem key={provider.id} value={provider.id}>{provider.label}</SelectItem>)}</SelectContent></Select>}<div className="rounded-2xl bg-white/[.025] p-3 text-xs leading-5 text-muted-foreground">{project.videoProviderMode === "automatic" ? "Uses your enabled provider order and records every fallback attempt." : "Locks this project to one provider; no automatic fallback."}</div></div></CardContent></Card>
          </aside>

          <section className="min-w-0 rounded-[2rem] border border-white/[.07] bg-card/70 p-4 sm:p-6">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Production timeline</p><h2 className="mt-2 font-display text-3xl">{timeline.length ? `${timeline.length} planned clips` : "No clip plan yet"}</h2></div><div className={`rounded-full border px-4 py-2 text-sm ${total >= 61 ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-amber-400/20 bg-amber-400/10 text-amber-200"}`}>{total}s total</div></div>
            {timeline.length ? <div className="space-y-3">{timeline.map((clip, index) => <div key={clip.id} className="grid gap-3 rounded-2xl border border-white/[.06] bg-black/15 p-3 sm:grid-cols-[44px_minmax(0,1fr)_110px_64px] sm:items-center"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 font-display text-lg text-primary">{String(index + 1).padStart(2, "0")}</div><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="truncate text-sm font-semibold">{clip.title}</h3><span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">{statusIcon(clip.status)} {clip.status}</span></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{clip.prompt}</p>{clip.providerKey && <p className="mt-1 text-[10px] uppercase tracking-wider text-primary/70">{clip.providerKey}</p>}</div><div><Label className="mb-1.5 block text-[10px] uppercase tracking-wider text-muted-foreground">Duration</Label><div className="relative"><Input type="number" min={1} max={30} value={clip.durationSeconds} onChange={event => setTimeline(current => current.map(item => item.id === clip.id ? { ...item, durationSeconds: Math.max(1, Math.min(30, Number(event.target.value) || 1)) } : item))} className="h-9" /><span className="absolute right-2.5 top-2.5 text-[10px] text-muted-foreground">sec</span></div></div><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => move(index, 1)} disabled={index === timeline.length - 1}><ArrowDown className="h-4 w-4" /></Button></div></div>)}<div className="flex justify-end pt-2"><Button variant="outline" className="bg-white/[.02]" onClick={save} disabled={total < 61 || saveTimeline.isPending}>{saveTimeline.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Save timeline</Button></div></div> : <div className="grid min-h-96 place-items-center rounded-3xl border border-dashed border-white/10 bg-black/10 p-8 text-center"><div><Sparkles className="mx-auto mb-4 h-8 w-8 text-primary" /><h3 className="font-display text-3xl">Direct the first cut</h3><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">Upload references, then generate a structured plan of connected short clips totaling at least 61 seconds.</p><Button className="mt-6" onClick={() => plan.mutate({ projectId })} disabled={plan.isPending}><Sparkles className="mr-2 h-4 w-4" /> Generate clip plan</Button></div></div>}
          </section>

          <aside className="space-y-5">
            <Card className="border-white/[.07] bg-card/70"><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="eyebrow">Generation jobs</p><h3 className="mt-2 font-display text-2xl">Activity</h3></div><Badge variant="outline" className="border-white/10">{activeJobs.length}</Badge></div><div className="mt-4 space-y-3">{activeJobs.length ? activeJobs.slice(0, 8).map(job => <div key={job.id} className="rounded-2xl bg-white/[.025] p-3"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-medium">{statusIcon(job.status)} {job.providerKey ?? "Provider"}</span>{job.externalJobId && (job.status === "queued" || job.status === "running") && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => refresh.mutate({ jobId: job.id })}><RefreshCw className="h-3.5 w-3.5" /></Button>}</div><Progress value={job.progress} className="mt-3 h-1" /><div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>Attempt {job.attempt}</span><span>{job.progress}%</span></div>{job.errorMessage && <p className="mt-2 text-xs leading-5 text-red-200/80">{job.errorMessage}</p>}</div>) : <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs leading-5 text-muted-foreground">Generation attempts will appear here with queued, running, completed, and failed states.</div>}</div></CardContent></Card>
            <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card"><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="eyebrow">Master export</p><h3 className="mt-2 font-display text-2xl">TikTok-ready MP4</h3></div><Video className="h-5 w-5 text-primary" /></div><div className="mt-5 rounded-2xl border border-white/[.07] bg-black/15 p-4"><div className="flex items-end justify-between"><span className="text-xs text-muted-foreground">Timeline duration</span><span className="font-display text-3xl">{total}s</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (total / 61) * 100)}%` }} /></div><p className="mt-2 text-[10px] text-muted-foreground">Minimum export length: 61 seconds</p></div><Button className="mt-4 w-full" disabled={total < 61 || timeline.some(clip => clip.status !== "completed") || exports.some(item => item.status === "running") || assemble.isPending} onClick={() => assemble.mutate({ projectId })}>{assemble.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Assemble new MP4</Button>{exports.length > 0 && <div className="mt-5 border-t border-white/[.07] pt-4"><p className="mb-3 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Export history</p><div className="space-y-2">{exports.slice(0, 6).map(item => { const asset = assets.find(candidate => candidate.id === item.assetId); return <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/15 px-3 py-2"><div><p className="text-xs font-medium">Export #{item.id}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{item.durationSeconds}s · {new Date(item.createdAt).toLocaleDateString()}</p></div>{item.status === "completed" && asset ? <a href={asset.url} download className="text-xs font-medium text-primary hover:underline">Download</a> : <span className={`text-[10px] uppercase tracking-wider ${item.status === "failed" ? "text-red-200" : "text-muted-foreground"}`}>{item.status}</span>}</div>; })}</div></div>}</CardContent></Card>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
