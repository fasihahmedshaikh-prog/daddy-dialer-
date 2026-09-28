import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { useAuth } from './AuthContext';
import { supabase } from '@/lib/supabase';
import { RingbackTone } from '@/lib/ringback';
import type { Lead } from '@/types/database';

export type CallUIState = 'idle' | 'connecting' | 'live' | 'conferencing';

interface ActiveCallContext {
  leadId?: string;
  sessionId?: string;
  lead?: Lead;
  toNumber: string;
  callSid?: string;
}

export interface EndedCallInfo {
  callSid: string | null;
  leadId?: string;
  sessionId?: string;
  toNumber: string;
  durationSeconds: number;
  wasAccepted: boolean;
}

interface DialerContextValue {
  deviceReady: boolean;
  deviceError: string | null;
  callState: CallUIState;
  activeCall: ActiveCallContext | null;
  durationSeconds: number;
  muted: boolean;
  widgetOpen: boolean;
  setWidgetOpen: (open: boolean) => void;
  placeCall: (toNumber: string, ctx?: Partial<ActiveCallContext>) => Promise<void>;
  /** "Join me" — bridges a third number into the CURRENT call's conference
   * room via a server-side Twilio REST call. Does not touch the browser's
   * own Device connection (a Device can only hold one active call). */
  addParticipant: (toNumber: string) => Promise<{ ok: boolean; error?: string }>;
  hangup: () => void;
  toggleMute: () => void;
  sendDigit: (digit: string) => void;
  inputDevices: MediaDeviceInfo[];
  outputDevices: MediaDeviceInfo[];
  selectedInputDeviceId: string | null;
  setInputDevice: (deviceId: string) => Promise<void>;
  refreshDevices: () => Promise<void>;
  /** The most recently ended call, so a page (e.g. the Session Dialer) can
   * attach a disposition to the matching dial_call_logs row. Cleared by the
   * consumer via `clearLastEndedCall()` once it's handled. */
  lastEndedCall: EndedCallInfo | null;
  clearLastEndedCall: () => void;
}

const DialerContext = createContext<DialerContextValue | undefined>(undefined);

export function DialerProvider({ children }: { children: React.ReactNode }) {
  const { workspaceId, session } = useAuth();
  const deviceRef = useRef<Device | null>(null);
  const activeConnectionRef = useRef<Call | null>(null);
  const ringbackRef = useRef<RingbackTone>(new RingbackTone());
  const durationTimerRef = useRef<number | null>(null);

  const [deviceReady, setDeviceReady] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [callState, setCallState] = useState<CallUIState>('idle');
  const [activeCall, setActiveCall] = useState<ActiveCallContext | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState<string | null>(null);
  const [lastEndedCall, setLastEndedCall] = useState<EndedCallInfo | null>(null);

  const fetchToken = useCallback(async (): Promise<string | null> => {
    if (!workspaceId || !session) return null;
    const { data, error } = await supabase.functions.invoke('twilio-token', {
      body: { workspace_id: workspaceId },
    });
    if (error || !data?.token) {
      setDeviceError(data?.error ?? error?.message ?? 'Could not fetch Twilio token');
      return null;
    }
    setDeviceError(null);
    return data.token as string;
  }, [workspaceId, session]);

  const refreshDevices = useCallback(async () => {
    try {
      // Enumerate only reports labels after permission has been granted at
      // least once — Device.audio's own enumeration (below) triggers that.
      const all = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(all.filter((d) => d.kind === 'audioinput'));
      setOutputDevices(all.filter((d) => d.kind === 'audiooutput'));
    } catch (err) {
      console.error('enumerateDevices failed', err);
    }
  }, []);

  // Set up the Twilio Device once we know which workspace we're in.
  useEffect(() => {
    if (!workspaceId || !session) return;
    let cancelled = false;
    let device: Device | null = null;

    (async () => {
      const token = await fetchToken();
      if (!token || cancelled) return;

      device = new Device(token, {
        logLevel: 'error',
        // Keep the codec list broad for compatibility with older networks.
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU] as any,
      });
      deviceRef.current = device;

      device.on('registered', () => setDeviceReady(true));
      device.on('error', (e) => setDeviceError(e.message));
      device.on('tokenWillExpire', async () => {
        const fresh = await fetchToken();
        if (fresh) device?.updateToken(fresh);
      });

      // Bluetooth headsets connected AFTER page load otherwise get ignored —
      // re-enumerate whenever the OS device list changes, per the spec.
      device.audio?.on('deviceChange', () => {
        refreshDevices();
      });

      try {
        await device.register();
      } catch (err) {
        setDeviceError(err instanceof Error ? err.message : String(err));
      }

      await refreshDevices();
    })();

    return () => {
      cancelled = true;
      device?.destroy();
      deviceRef.current = null;
      setDeviceReady(false);
    };
  }, [workspaceId, session, fetchToken, refreshDevices]);

  const clearDurationTimer = () => {
    if (durationTimerRef.current) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  };

  const wireUpConnection = useCallback((call: Call, ctx: ActiveCallContext) => {
    activeConnectionRef.current = call;
    setCallState('connecting');
    setActiveCall(ctx);
    setDurationSeconds(0);
    setMuted(false);
    ringbackRef.current.start();
    let accepted = false;
    let liveDuration = 0;

    call.on('ringing', () => {
      const sid = (call.parameters as { CallSid?: string } | undefined)?.CallSid;
      if (sid) setActiveCall((prev) => (prev ? { ...prev, callSid: sid } : prev));
    });

    call.on('accept', () => {
      accepted = true;
      ringbackRef.current.stop();
      setCallState('live');
      durationTimerRef.current = window.setInterval(() => {
        liveDuration += 1;
        setDurationSeconds(liveDuration);
      }, 1000);
    });

    const finalize = () => {
      ringbackRef.current.stop();
      clearDurationTimer();
      const sid = (call.parameters as { CallSid?: string } | undefined)?.CallSid ?? null;
      setLastEndedCall({
        callSid: sid,
        leadId: ctx.leadId,
        sessionId: ctx.sessionId,
        toNumber: ctx.toNumber,
        durationSeconds: liveDuration,
        wasAccepted: accepted,
      });
      setCallState('idle');
      setActiveCall(null);
      activeConnectionRef.current = null;
    };

    call.on('disconnect', finalize);
    call.on('cancel', finalize);
    call.on('reject', finalize);

    call.on('error', (err) => {
      console.error('call error', err);
      setDeviceError(err.message);
    });

    call.on('mute', (isMuted: boolean) => setMuted(isMuted));
  }, []);

  const placeCall = useCallback(
    async (toNumber: string, ctx?: Partial<ActiveCallContext>) => {
      const device = deviceRef.current;
      if (!device || !workspaceId) {
        setDeviceError('Dialer is not ready yet — check your Twilio settings.');
        return;
      }
      setWidgetOpen(true);
      const params: Record<string, string> = {
        To: toNumber,
        workspace_id: workspaceId,
      };
      if (ctx?.leadId) params.lead_id = ctx.leadId;
      if (ctx?.sessionId) params.session_id = ctx.sessionId;

      const call = await device.connect({ params });
      wireUpConnection(call, {
        toNumber,
        leadId: ctx?.leadId,
        sessionId: ctx?.sessionId,
        lead: ctx?.lead,
      });
    },
    [workspaceId, wireUpConnection]
  );

  const addParticipant = useCallback(
    async (toNumber: string): Promise<{ ok: boolean; error?: string }> => {
      if (!workspaceId || !activeConnectionRef.current) {
        return { ok: false, error: 'No active call to bridge into.' };
      }
      const hostCallSid = (activeConnectionRef.current.parameters as { CallSid?: string } | undefined)?.CallSid;
      if (!hostCallSid) {
        return { ok: false, error: 'Call is still connecting — wait for it to ring before adding someone.' };
      }
      const { data, error } = await supabase.functions.invoke('twilio-add-participant', {
        body: {
          workspace_id: workspaceId,
          host_call_sid: hostCallSid,
          session_id: activeCall?.sessionId,
          to_number: toNumber,
        },
      });
      if (error || !data?.ok) {
        return { ok: false, error: data?.error ?? error?.message ?? 'Could not bridge that number in.' };
      }
      setCallState('conferencing');
      return { ok: true };
    },
    [workspaceId, activeCall?.sessionId]
  );

  const hangup = useCallback(() => {
    activeConnectionRef.current?.disconnect();
    deviceRef.current?.disconnectAll();
  }, []);

  const toggleMute = useCallback(() => {
    const call = activeConnectionRef.current;
    if (!call) return;
    const next = !muted;
    call.mute(next);
    setMuted(next);
  }, [muted]);

  const sendDigit = useCallback((digit: string) => {
    activeConnectionRef.current?.sendDigits(digit);
  }, []);

  const setInputDevice = useCallback(async (deviceId: string) => {
    const device = deviceRef.current;
    if (!device?.audio) return;
    await device.audio.setInputDevice(deviceId);
    setSelectedInputDeviceId(deviceId);
  }, []);

  useEffect(() => () => clearDurationTimer(), []);

  const clearLastEndedCall = useCallback(() => setLastEndedCall(null), []);

  const value: DialerContextValue = {
    deviceReady,
    deviceError,
    callState,
    activeCall,
    durationSeconds,
    muted,
    widgetOpen,
    setWidgetOpen,
    placeCall,
    addParticipant,
    hangup,
    toggleMute,
    sendDigit,
    inputDevices,
    outputDevices,
    selectedInputDeviceId,
    setInputDevice,
    refreshDevices,
    lastEndedCall,
    clearLastEndedCall,
  };

  return <DialerContext.Provider value={value}>{children}</DialerContext.Provider>;
}

export function useDialer() {
  const ctx = useContext(DialerContext);
  if (!ctx) throw new Error('useDialer must be used within DialerProvider');
  return ctx;
}
