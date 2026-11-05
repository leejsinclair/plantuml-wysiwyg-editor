// Shared render helper that wraps the component tree in MantineProvider so tests
// of Mantine-using components (Toolbar, CommandBar, Workspace) work without a real app shell.
import { render as rtlRender, type RenderOptions, type RenderResult } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import type { ReactElement } from 'react';

function render(ui: ReactElement, options?: RenderOptions): RenderResult {
  const { wrapper: Wrapper, ...rest } = options ?? {};
  const Combined = Wrapper
    ? ({ children }: { children: React.ReactNode }) => (
        <MantineProvider env="test"><Wrapper>{children}</Wrapper></MantineProvider>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <MantineProvider env="test">{children}</MantineProvider>
      );
  return rtlRender(ui, { ...rest, wrapper: Combined });
}

export { render };
export * from '@testing-library/react';
