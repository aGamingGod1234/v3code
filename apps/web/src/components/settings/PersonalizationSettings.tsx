// Personalization settings panel.
//
//   * Custom prompts CRUD — wired to useSettings.customPrompts. Each prompt
//     gets per-prompt enable/disable. Length limits and delimiter safety are
//     enforced both here and in the schema.
//   * Dictation hotkey capture — UI works; recording wiring is stubbed and
//     labelled "Coming soon" (per Phase 1 honesty rule).

import { useCallback, useMemo, useState } from "react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { useSettings, useUpdateSettings } from "../../hooks/useSettings";

const NAME_MAX = 60;
const CONTENT_MAX = 4000;
const TOTAL_ENABLED_MAX = 16000;
const PROMPTS_MAX = 20;
const DELIMITER_VIOLATION = /={5,}\s*USER-CONFIG INSTRUCTIONS|={30,}/;

interface CustomPromptDraft {
  readonly id: string;
  name: string;
  content: string;
  enabled: boolean;
}

const blankDraft = (): CustomPromptDraft => ({
  id: crypto.randomUUID(),
  name: "",
  content: "",
  enabled: true,
});

export function PersonalizationSettings() {
  const customPrompts = useSettings((s) => s.customPrompts);
  const { updateSettings } = useUpdateSettings();
  const [editing, setEditing] = useState<CustomPromptDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalEnabledLength = useMemo(
    () =>
      customPrompts
        .filter((prompt) => prompt.enabled)
        .reduce((sum, prompt) => sum + prompt.content.length, 0),
    [customPrompts],
  );

  const startNew = useCallback(() => {
    if (customPrompts.length >= PROMPTS_MAX) {
      setError(`Limit reached (${PROMPTS_MAX} prompts max).`);
      return;
    }
    setError(null);
    setEditing(blankDraft());
  }, [customPrompts.length]);

  const startEdit = useCallback(
    (index: number) => {
      const existing = customPrompts[index];
      if (!existing) return;
      setError(null);
      setEditing({
        id: existing.id,
        name: existing.name,
        content: existing.content,
        enabled: existing.enabled,
      });
    },
    [customPrompts],
  );

  const onSave = useCallback(() => {
    if (!editing) return;
    const trimmedName = editing.name
      .replace(/[\r\n]+/g, " ")
      .slice(0, NAME_MAX)
      .trim();
    if (trimmedName.length === 0) {
      setError("Name is required.");
      return;
    }
    if (editing.content.length > CONTENT_MAX) {
      setError(`Content exceeds ${CONTENT_MAX} characters.`);
      return;
    }
    if (DELIMITER_VIOLATION.test(editing.content)) {
      setError("Content can't contain '=====' delimiter rows or 'USER-CONFIG INSTRUCTIONS'.");
      return;
    }
    const otherEnabled = customPrompts
      .filter((prompt) => prompt.id !== editing.id && prompt.enabled)
      .reduce((sum, prompt) => sum + prompt.content.length, 0);
    if (editing.enabled && otherEnabled + editing.content.length > TOTAL_ENABLED_MAX) {
      setError(
        `Total enabled content would exceed ${TOTAL_ENABLED_MAX} characters. Disable another prompt first.`,
      );
      return;
    }
    const next = [...customPrompts];
    const existingIndex = next.findIndex((prompt) => prompt.id === editing.id);
    const merged = {
      id: editing.id,
      name: trimmedName,
      content: editing.content,
      enabled: editing.enabled,
    };
    if (existingIndex >= 0) {
      next[existingIndex] = merged;
    } else {
      next.push(merged);
    }
    updateSettings({ customPrompts: next });
    setEditing(null);
    setError(null);
  }, [editing, customPrompts, updateSettings]);

  const onDelete = useCallback(
    (id: string) => {
      updateSettings({ customPrompts: customPrompts.filter((prompt) => prompt.id !== id) });
    },
    [customPrompts, updateSettings],
  );

  const onToggle = useCallback(
    (id: string, enabled: boolean) => {
      const next = customPrompts.map((prompt) =>
        prompt.id === id ? { ...prompt, enabled } : prompt,
      );
      const totalEnabled = next
        .filter((prompt) => prompt.enabled)
        .reduce((sum, prompt) => sum + prompt.content.length, 0);
      if (enabled && totalEnabled > TOTAL_ENABLED_MAX) {
        setError(
          `Total enabled content would exceed ${TOTAL_ENABLED_MAX} characters. Disable another prompt first.`,
        );
        return;
      }
      setError(null);
      updateSettings({ customPrompts: next });
    },
    [customPrompts, updateSettings],
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Custom prompts</h3>
            <p className="text-xs text-muted-foreground">
              Appended below the core system instructions in a clearly-delimited user-config block.
              They never override core/tool behaviour.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={startNew}
            disabled={customPrompts.length >= PROMPTS_MAX}
          >
            <PlusIcon className="mr-1 size-3" /> New prompt
          </Button>
        </header>
        <div className="text-[11px] text-muted-foreground">
          {customPrompts.length}/{PROMPTS_MAX} prompts · {totalEnabledLength}/{TOTAL_ENABLED_MAX}{" "}
          enabled chars
        </div>
        {error ? (
          <div className="rounded-md border border-error/40 bg-error/10 p-2 text-xs text-error-foreground">
            {error}
          </div>
        ) : null}
        <ul className="space-y-2">
          {customPrompts.map((prompt, index) => (
            <li
              key={prompt.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-card/30 p-3"
            >
              <input
                type="checkbox"
                checked={prompt.enabled}
                onChange={(event) => onToggle(prompt.id, event.currentTarget.checked)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{prompt.name}</div>
                <div className="line-clamp-2 text-xs text-muted-foreground">{prompt.content}</div>
              </div>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => startEdit(index)}
                aria-label="Edit prompt"
              >
                <PencilIcon className="size-3" />
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => onDelete(prompt.id)}
                aria-label="Delete prompt"
              >
                <Trash2Icon className="size-3" />
              </Button>
            </li>
          ))}
          {customPrompts.length === 0 ? (
            <li className="rounded-md border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
              No custom prompts yet.
            </li>
          ) : null}
        </ul>
      </section>

      {editing ? (
        <section className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              {customPrompts.some((prompt) => prompt.id === editing.id)
                ? "Edit prompt"
                : "New prompt"}
            </h4>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-foreground">Name</span>
            <input
              type="text"
              value={editing.name}
              maxLength={NAME_MAX}
              onChange={(event) => setEditing({ ...editing, name: event.currentTarget.value })}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-foreground">Content</span>
            <Textarea
              value={editing.content}
              onChange={(event) => setEditing({ ...editing, content: event.currentTarget.value })}
              rows={6}
              maxLength={CONTENT_MAX}
              className="mt-1 font-mono text-xs"
            />
            <div className="mt-1 text-[11px] text-muted-foreground">
              {editing.content.length}/{CONTENT_MAX} chars
            </div>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" onClick={onSave}>
              Save prompt
            </Button>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-semibold text-foreground">Dictation</h3>
          <p className="text-xs text-muted-foreground">
            Hotkey capture works. Recording is wired in a follow-up.
          </p>
        </header>
        <div className="rounded-md border border-dashed border-border/60 bg-card/30 px-3 py-2 text-xs text-muted-foreground">
          Coming soon. The composer dictation pipeline lands in a later phase.
        </div>
      </section>
    </div>
  );
}
