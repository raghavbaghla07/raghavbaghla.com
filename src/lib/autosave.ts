/** Serializes cloud saves. No draft data is persisted in browser storage. */
export class Autosave {
    private timer: ReturnType<typeof setTimeout> | undefined;
    private active: Promise<void> | null = null;
    private pending = false;
    private failure: unknown = null;
    private persist: () => Promise<void>;
    private onError: (error: unknown) => void;
    private delay: number;
    constructor(persist: () => Promise<void>, onError: (error: unknown) => void, delay = 1800) {
        this.persist = persist;
        this.onError = onError;
        this.delay = delay;
    }
    get paused() { return this.failure !== null; }
    get saving() { return this.active !== null; }
    schedule() {
        if (this.paused)
            return;
        this.pending = true;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { void this.flush().catch(() => { }); }, this.delay);
    }
    flush(): Promise<void> {
        clearTimeout(this.timer);
        if (this.paused)
            return Promise.reject(this.failure);
        if (this.active)
            return this.active;
        if (!this.pending)
            return Promise.resolve();
        this.active = (async () => {
            try {
                while (this.pending) {
                    this.pending = false;
                    await this.persist();
                }
            }
            catch (error) {
                this.failure = error;
                this.pending = false;
                this.onError(error);
                throw error;
            }
            finally {
                this.active = null;
            }
        })();
        return this.active;
    }
    cancel() {
        clearTimeout(this.timer);
        this.pending = false;
        this.failure = null;
    }
}
