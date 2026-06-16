// Side-effect module: filter out one specific benign unhandled-promise rejection.
//
// expo-maps' GoogleMapsView.setCameraPosition calls the native animateCamera and
// discards the returned promise, so when one camera animation interrupts another
// it rejects with "Animation cancelled" — impossible to catch at the call site.
// It's harmless but spams LogBox/console while zooming and panning. We re-install
// the promise rejection tracker with a filter that swallows only that rejection
// and reports everything else as React Native normally would.
//
// Hermes (this app's engine) uses HermesInternal.enablePromiseRejectionTracker;
// the non-Hermes path uses the `promise` polyfill's rejection-tracking module.

const BENIGN = /setCameraPosition.*has been rejected|Animation cancelled/;

function isBenign(error: unknown): boolean {
  const message =
    typeof error === 'string'
      ? error
      : String((error as { message?: string })?.message ?? error ?? '');
  return BENIGN.test(message);
}

function report(id: number, error: unknown) {
  const err = error as { stack?: string; message?: string } | undefined;
  console.error(
    `Possible Unhandled Promise Rejection (id: ${id}):\n${err?.stack ?? err?.message ?? String(error)}`
  );
}

const tracker = {
  allRejections: true,
  onUnhandled: (id: number, error: unknown) => {
    if (!isBenign(error)) report(id, error);
  },
  onHandled: () => {},
};

const hermes = (globalThis as { HermesInternal?: { enablePromiseRejectionTracker?: (o: unknown) => void } })
  .HermesInternal;

if (hermes?.enablePromiseRejectionTracker) {
  hermes.enablePromiseRejectionTracker(tracker);
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rejectionTracking = require('promise/setimmediate/rejection-tracking');
  rejectionTracking.enable(tracker);
}
