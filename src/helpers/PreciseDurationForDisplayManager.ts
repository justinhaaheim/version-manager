type UpdateCallback = (formattedDuration: string) => void;

interface PreciseDurationManagerConfig {
  formatter: (durationMs: number) => string;
  onUpdate: UpdateCallback;
}

export class PreciseDurationForDisplayManager {
  private rafId: number | null = null;
  private lastUpdateTime = 0;
  private lastKnownDurationMs = 0;
  private lastFormattedValue: string | null = null;
  private isActive = false;
  private onUpdate: UpdateCallback;
  private formatter: (durationMs: number) => string;

  constructor(config: PreciseDurationManagerConfig) {
    this.onUpdate = config.onUpdate;
    this.formatter = config.formatter;
    this.lastFormattedValue = this.formatter(0);
    this.onUpdate(this.lastFormattedValue);
  }

  public update(actualDurationMs: number, isActive: boolean): void {
    this.lastKnownDurationMs = actualDurationMs;
    this.lastUpdateTime = performance.now();
    this.isActive = isActive;

    if (isActive) {
      this.start();
    } else {
      this.stop();
    }

    // Always check for an immediate format change on update
    this.checkFormattedValue();
  }

  public unload(): void {
    this.stop();
  }

  private start(): void {
    if (this.rafId != null) {
      return;
    }
    this.lastUpdateTime = performance.now();
    this.animate();
  }

  private stop(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // Check for an immediate format change on stop
    this.checkFormattedValue();
  }

  private animate = (): void => {
    if (!this.isActive) {
      this.rafId = null;
      return;
    }

    this.checkFormattedValue();
    this.rafId = requestAnimationFrame(this.animate);
  };

  private checkFormattedValue(): void {
    const elapsedSinceUpdate = this.isActive
      ? performance.now() - this.lastUpdateTime
      : 0;
    const estimatedCurrentDuration =
      this.lastKnownDurationMs + elapsedSinceUpdate;
    const newFormattedValue = this.formatter(estimatedCurrentDuration);

    if (newFormattedValue !== this.lastFormattedValue) {
      this.lastFormattedValue = newFormattedValue;
      this.onUpdate(newFormattedValue);
    }
  }
}
