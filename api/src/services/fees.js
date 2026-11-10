// Moteur de frais configurable, en deux composantes :
//   - processing : frais de paiement (opérateur / passerelle) — dépôt et retrait ;
//   - service    : frais de service iKobi.
// Pour chaque composante, la règle active la plus spécifique gagne (pays > fournisseur > opérateur > devise).
// Cotisation : les frais s'AJOUTENT au montant payé. Versement : les frais sont DÉDUITS de la cagnotte.
// Arrondi à l'unité mineure supérieure, par composante (jamais de sous-facturation cachée).

const SPECIFICITY = ['country', 'provider', 'method', 'currency'];
const COMPONENTS = ['processing', 'service'];

export function createFeeEngine({ db }) {
  async function findRule({ txType, component, country, provider, method, currency }) {
    const rules = await db('fee_rules').where({ tx_type: txType, component, active: true });
    const want = { country, provider, method, currency };
    let best = null;
    let bestScore = -1;
    for (const r of rules) {
      let score = 0;
      let ok = true;
      SPECIFICITY.forEach((k, i) => {
        if (r[k] === '*') return;
        if (r[k] !== want[k]) ok = false;
        else score += 2 ** (SPECIFICITY.length - i);
      });
      if (ok && (score > bestScore || (score === bestScore && r.id > best.id))) {
        best = r;
        bestScore = score;
      }
    }
    return best;
  }

  const compute = (rule, baseMinor) => (rule ? Math.ceil((baseMinor * rule.pct_bp) / 10000) + Number(rule.fixed_minor || 0) : 0);

  async function breakdown(txType, baseMinor, ctx) {
    const out = {};
    for (const component of COMPONENTS) {
      const rule = await findRule({ txType, component, ...ctx });
      out[component] = { minor: compute(rule, baseMinor), pctBp: rule?.pct_bp ?? 0, ruleId: rule?.id ?? null };
    }
    return out;
  }

  return {
    findRule,
    async quoteContribution({ principalMinor, currency, country, provider, method }) {
      const b = await breakdown('contribution', principalMinor, { currency, country, provider, method });
      const fee = b.processing.minor + b.service.minor;
      return {
        principalMinor,
        processingFeeMinor: b.processing.minor,
        serviceFeeMinor: b.service.minor,
        feeMinor: fee,
        totalMinor: principalMinor + fee,
        netToPoolMinor: principalMinor,
        rates: { processingBp: b.processing.pctBp, serviceBp: b.service.pctBp },
      };
    },
    async quotePayout({ grossMinor, currency, country, provider, method }) {
      const b = await breakdown('payout', grossMinor, { currency, country, provider, method });
      const fee = Math.min(b.processing.minor + b.service.minor, grossMinor);
      const service = Math.min(b.service.minor, fee);
      return {
        grossMinor,
        processingFeeMinor: fee - service,
        serviceFeeMinor: service,
        feeMinor: fee,
        netMinor: grossMinor - fee,
        rates: { processingBp: b.processing.pctBp, serviceBp: b.service.pctBp },
      };
    },
  };
}
