import React, { useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Grid3x3, Minus, X, Users } from 'lucide-react';
import { useDialer } from '@/contexts/DialerContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DtmfKeypad } from './DtmfKeypad';
import { CallStatePill } from './CallStatePill';
import { formatDuration, formatPhoneDisplay, normalizePhone, cn } from '@/lib/utils';

/** Global dial pad — mountable anywhere, always available. Can call any
 * number regardless of what page you're on, and keeps the DTMF pad visible
 * from connecting through the whole call. */
export function FloatingDialWidget() {
  const dialer = useDialer();
  const [minimized, setMinimized] = useState(true);
  const [dialInput, setDialInput] = useState('');
  const [addNumber, setAddNumber] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const inCall = dialer.callState !== 'idle';
  const showKeypad = dialer.callState === 'connecting' || dialer.callState === 'live' || dialer.callState === 'conferencing';

  if (!dialer.widgetOpen && !inCall) {
    return (
      <button
        onClick={() => dialer.setWidgetOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-black shadow-lg hover:bg-accent-bright"
        title="Open dialer"
      >
        <Phone className="h-5 w-5" />
      </button>
    );
  }

  if (minimized && !inCall) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-surface-overlay border border-border-strong text-accent shadow-lg hover:bg-surface-hover"
      >
        <Phone className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-72 rounded-lg border border-border-strong bg-surface-overlay shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-medium">Dialer</span>
          <CallStatePill state={dialer.callState} />
        </div>
        <div className="flex items-center gap-1">
          {!inCall && (
            <button onClick={() => setMinimized(true)} className="text-text-tertiary hover:text-text-primary">
              <Minus className="h-3.5 w-3.5" />
            </button>
          )}
          {!inCall && (
            <button onClick={() => dialer.setWidgetOpen(false)} className="text-text-tertiary hover:text-text-primary">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3">
        {dialer.deviceError && (
          <p className="rounded border border-danger/30 bg-danger/10 p-2 text-xs text-danger">{dialer.deviceError}</p>
        )}

        {!inCall && (
          <>
            <Input
              placeholder="Enter a phone number"
              value={dialInput}
              onChange={(e) => setDialInput(e.target.value)}
              className="mono-num text-center text-base"
            />
            <DtmfKeypad onPress={(d) => setDialInput((v) => v + d)} />
            <Button
              className="w-full"
              disabled={!dialer.deviceReady || !dialInput}
              onClick={() => {
                const n = normalizePhone(dialInput);
                if (n) dialer.placeCall(n);
              }}
            >
              <Phone className="h-3.5 w-3.5" /> Call
            </Button>
          </>
        )}

        {inCall && (
          <>
            <div className="text-center">
              <div className="mono-num text-lg font-semibold">
                {formatPhoneDisplay(dialer.activeCall?.toNumber)}
              </div>
              {dialer.activeCall?.lead?.business_name && (
                <div className="text-xs text-text-secondary">{dialer.activeCall.lead.business_name}</div>
              )}
              <div className="mono-num mt-1 text-sm text-text-tertiary">{formatDuration(dialer.durationSeconds)}</div>
            </div>

            {/* DTMF keypad: stays mounted for connecting/live/conferencing — never removed mid-call. */}
            {showKeypad && <DtmfKeypad onPress={dialer.sendDigit} />}

            {showAdd ? (
              <div className="flex gap-1.5">
                <Input
                  placeholder="Number to bridge in"
                  value={addNumber}
                  onChange={(e) => setAddNumber(e.target.value)}
                  className="mono-num text-sm"
                />
                <Button
                  size="sm"
                  disabled={adding}
                  onClick={async () => {
                    const n = normalizePhone(addNumber);
                    if (!n) return;
                    setAdding(true);
                    const result = await dialer.addParticipant(n);
                    setAdding(false);
                    if (result.ok) {
                      setAddNumber('');
                      setShowAdd(false);
                    } else {
                      setAddError(result.error ?? 'Could not bridge that number in.');
                    }
                  }}
                >
                  {adding ? 'Adding…' : 'Add'}
                </Button>
              </div>
            ) : null}
            {addError && <p className="text-xs text-danger">{addError}</p>}
            {!showAdd && (
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => {
                  setAddError(null);
                  setShowAdd(true);
                }}
              >
                <Users className="h-3.5 w-3.5" /> Join me — bridge in a number
              </Button>
            )}

            <div className="flex items-center justify-center gap-2">
              <Button variant="secondary" size="icon" onClick={dialer.toggleMute} title={dialer.muted ? 'Unmute' : 'Mute'}>
                {dialer.muted ? <MicOff className="h-4 w-4 text-danger" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button variant="destructive" size="icon" onClick={dialer.hangup} title="Hang up">
                <PhoneOff className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
