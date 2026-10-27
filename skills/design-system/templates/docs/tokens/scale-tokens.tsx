import { tokenCell as cell, tokens } from './tokens';

/** Polices, tailles de texte, rayons, hauteurs et ombres, avec un exemple rendu. */
export function ScaleTokens({ prefix }: { prefix: 'font-' | 'radius-' | 'shadow-' | 'spacing-' | 'text-' }) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <tbody>
        {tokens(prefix).map((token) => (
          <tr key={token.name}>
            <td className={`${cell} w-48 font-mono text-xs`}>{token.name}</td>
            <td className={cell}>
              {prefix === 'radius-' && (
                <span
                  className="block h-10 w-24 border border-line-strong bg-surface-alt"
                  style={{ borderRadius: `var(--${token.name})` }}
                />
              )}
              {prefix === 'spacing-' && (
                <span className="block w-24 rounded-control bg-primary" style={{ height: `var(--${token.name})` }} />
              )}
              {prefix === 'shadow-' && (
                <span
                  className="block h-12 w-24 rounded-card border border-line bg-surface"
                  style={{ boxShadow: `var(--${token.name})` }}
                />
              )}
              {prefix === 'font-' && <span style={{ fontFamily: `var(--${token.name})` }}>Portez ce vieux whisky au juge blond qui fume</span>}
              {prefix === 'text-' && <span style={{ fontSize: `var(--${token.name})` }}>Portez ce vieux whisky au juge blond qui fume</span>}
            </td>
            <td className={`${cell} font-mono text-xs text-muted`}>{token.light}</td>
            <td className={`${cell} text-muted`}>{token.note ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
