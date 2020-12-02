type RateLimitedFn<InputTypes extends any[], OutputTypes extends any> = (...args: InputTypes) => Promise<OutputTypes>;

const promTimeout = (timeout: number) => new Promise((resolve) => setTimeout(resolve, timeout));


export class RateLimiter {
  pending: number = 0;
  waitForAvailable: Promise<void>;
  // pendingProms: Promise<void>[];
  // pendingCalls: any[];

  constructor(private max: number, private delay?: number) {
    this.waitForAvailable = Promise.resolve();
  }

/*   putPendingCall(fn: any, args: any, resolve: any, reject: any) {
    this.pendingCalls.push({ fn, args, resolve, reject });
  }

  doNext() {
    if (!this.pendingCalls.length) return;
    const 
  }

  limited(fn, args): Promise<any> {
    return new Promise((resolve, reject) => {
      const index = this.pendingCalls.length;
      this.pendingCalls.push({ fn, args, resolve, reject, index });
    });
  } */

  async execute<InputTypes extends any[], OutputTypes extends any>(fn: RateLimitedFn<InputTypes, OutputTypes>, ...args: InputTypes): Promise<OutputTypes> {
    let n = ++this.pending;
    let setProm = n >= this.max;
    let resolveNext;

    let curProm = this.waitForAvailable;
    if (setProm) {
      this.waitForAvailable = new Promise((resolve) => resolveNext = resolve);
    }
    await curProm;

    return new Promise((resolve, reject) => {
      fn(...args).then((...ret) => {
        resolve(...ret);
      }).catch((err) => {
        reject(err);
      }).finally(async () => {
        this.pending--;
        if (resolveNext) {
          resolveNext()
          if (this.pending <= this.max) {
            this.waitForAvailable = Promise.resolve(this.waitForAvailable)
          }
        }
      });
    })
  }

  async rateLimit<InputTypes extends any[], OutputTypes extends any>(fn: RateLimitedFn<InputTypes, OutputTypes>, ...args: InputTypes): Promise<OutputTypes> {
    return this.execute(fn, ...args);
  }
}