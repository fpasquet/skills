import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

/** Variantes typées : chacune pose une classe de daisyUI (btn, btn-primary, btn-sm…), réglée par le thème. */
const buttonVariants = cva('btn', {
  variants: {
    variant: {
      default: 'btn-primary',
      primary: 'btn-primary',
      outline: 'btn-outline',
      secondary: 'btn-secondary',
      ghost: 'btn-ghost',
      destructive: 'btn-error',
      link: 'btn-link',
    },
    size: {
      default: '',
      xs: 'btn-xs',
      sm: 'btn-sm',
      lg: 'btn-lg',
      icon: 'btn-square',
      'icon-xs': 'btn-square btn-xs',
      'icon-sm': 'btn-square btn-sm',
      'icon-lg': 'btn-square btn-lg',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
