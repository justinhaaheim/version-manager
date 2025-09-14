import {useEffect, useLayoutEffect, useRef} from 'react';

export default function useRenderInfo(componentName: string): void {
  const componentNameStableRef = useRef(componentName);

  const totalRenderCount = useRef(0);
  const renderSinceLastLayoutEffectCount = useRef(0);
  const renderSinceLastEffectCount = useRef(0);

  const effectCount = useRef(0);
  const layoutEffectCount = useRef(0);

  totalRenderCount.current += 1;
  renderSinceLastLayoutEffectCount.current += 1;
  renderSinceLastEffectCount.current += 1;

  useLayoutEffect(() => {
    layoutEffectCount.current += 1;
    console.group(`[LayoutEffect] ${componentNameStableRef.current}`);
    console.debug(
      `[LayoutEffect] Total layoutEffect count:`,
      layoutEffectCount.current,
    );
    console.debug(
      `[LayoutEffect] Render count since last layoutEffect:`,
      renderSinceLastLayoutEffectCount.current,
    );
    console.debug(
      `[LayoutEffect] Total render count:`,
      totalRenderCount.current,
    );
    console.groupEnd();

    renderSinceLastLayoutEffectCount.current = 0;
  }, []);

  useEffect(() => {
    effectCount.current += 1;
    console.group(`[Effect] ${componentNameStableRef.current}`);
    console.debug(`[Effect] Total effect count:`, effectCount.current);
    console.debug(
      `[Effect] Render count since last effect:`,
      renderSinceLastEffectCount.current,
    );
    console.debug(`[Effect] Total render count:`, totalRenderCount.current);
    console.groupEnd();

    renderSinceLastEffectCount.current = 0;
  }, []);
}
