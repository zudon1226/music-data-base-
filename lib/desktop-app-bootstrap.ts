/** DESKTOP ONLY — compatibility re-exports for the unified auth bootstrap flow. */

export {
    canRenderDesktopApplicationShell,
    DESKTOP_BOOTSTRAP_LOG_PREFIX,
    diagnoseDesktopShellGate,
    runDesktopRemoteBootstrap,
    startDesktopLocalBootstrap,
    traceBootstrapStep,
    type DesktopBootstrapStep,
    type DesktopRemoteBootstrapActions,
    type DesktopRemoteBootstrapResult,
    type DesktopShellGateDecision,
    type DesktopShellGateInput,
} from "./desktop-auth-bootstrap-flow";
