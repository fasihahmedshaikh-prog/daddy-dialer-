import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'relative h-5 w-9 rounded-full bg-surface-hover border border-border-strong data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors',
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-text-secondary data-[state=checked]:bg-black data-[state=checked]:translate-x-[18px] transition-transform" />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';
