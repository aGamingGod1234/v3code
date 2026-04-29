import { useState } from "react";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { useAccentOverride, useTheme, useThemeName } from "../../hooks/useTheme";
import { THEME_LABEL, THEME_NAMES, type ThemeName } from "../../themes/themeNames";
import { THEME_SWATCHES } from "../../themes/themePalettes";
import { Button } from "../ui/button";

const ACCENT_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function ThemeSwatchPreview({
  active,
  mode,
  name,
  onSelect,
}: {
  readonly active: boolean;
  readonly mode: "light" | "dark";
  readonly name: ThemeName;
  readonly onSelect: () => void;
}) {
  const swatch = THEME_SWATCHES[name][mode];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col gap-2 rounded-xl border-2 p-3 text-left transition-colors ${
        active ? "border-primary bg-primary/5" : "border-border bg-card/40 hover:border-border/70"
      }`}
    >
      <div
        className="aspect-[16/10] w-full overflow-hidden rounded-md border border-border/60"
        style={{ backgroundColor: swatch.background }}
      >
        <div className="flex h-full items-end gap-2 p-2">
          <span className="block h-3 w-1/2 rounded-sm" style={{ backgroundColor: swatch.card }} />
          <span
            className="block h-3 w-1/4 rounded-sm"
            style={{ backgroundColor: swatch.primary }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{THEME_LABEL[name]}</span>
        <span className="text-muted-foreground">{mode}</span>
      </div>
    </button>
  );
}

export function AppearanceSettings() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const { setThemeName, themeName } = useThemeName();
  const { accentOverride, setAccent } = useAccentOverride();
  const interfaceProfile = useSettings((settings) => settings.interfaceProfile);
  const { updateSettings } = useUpdateSettings();
  const [accentText, setAccentText] = useState(accentOverride ?? "");
  const [accentError, setAccentError] = useState<string | null>(null);
  const selectedProfile = (themeName || interfaceProfile) as ThemeName;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-semibold text-foreground">Mode</h3>
          <p className="text-xs text-muted-foreground">
            Light, dark, or system controls the base surface. Interface profiles layer on top.
          </p>
        </header>
        <div className="flex gap-2">
          {(["light", "dark", "system"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={theme === option ? "default" : "outline"}
              onClick={() => setTheme(option)}
            >
              {option[0]?.toUpperCase()}
              {option.slice(1)}
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-semibold text-foreground">Interface profile</h3>
          <p className="text-xs text-muted-foreground">
            Changes the app shell, spacing, composer surface, pane chrome, and colour system.
            Provider-like profiles are legally distinct recreations of their workflows.
          </p>
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {THEME_NAMES.map((name) => (
            <ThemeSwatchPreview
              key={name}
              name={name}
              mode={resolvedTheme}
              active={selectedProfile === name}
              onSelect={() => {
                setThemeName(name);
                updateSettings({ interfaceProfile: name });
              }}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-semibold text-foreground">Accent override</h3>
          <p className="text-xs text-muted-foreground">
            Overrides the profile primary colour. Resetting removes the override and restores the
            selected profile.
          </p>
        </header>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={accentOverride ?? "#000000"}
            onChange={(event) => {
              setAccentError(null);
              setAccent(event.currentTarget.value);
              setAccentText(event.currentTarget.value);
            }}
            className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent"
          />
          <input
            type="text"
            value={accentText}
            placeholder="#a855f7"
            onChange={(event) => {
              setAccentText(event.currentTarget.value);
              setAccentError(null);
            }}
            onBlur={(event) => {
              const value = event.currentTarget.value.trim();
              if (value.length === 0) {
                setAccent(null);
                return;
              }
              if (!ACCENT_REGEX.test(value)) {
                setAccentError("Use #rgb, #rrggbb, or #rrggbbaa.");
                return;
              }
              setAccent(value);
            }}
            className="h-9 w-32 rounded-md border border-border bg-background px-2 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setAccent(null);
              setAccentText("");
              setAccentError(null);
            }}
            disabled={accentOverride === null && accentText.length === 0}
          >
            Reset
          </Button>
        </div>
        {accentError ? (
          <div className="text-[11px] text-error-foreground">{accentError}</div>
        ) : null}
      </section>
    </div>
  );
}
