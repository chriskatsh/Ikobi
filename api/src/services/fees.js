// Moteur de frais configurable.
// La règle la plus spécifique gagne (pays > fournisseur > opérateur > devise).
// Aucune règle = 0 frais. Les taux commerciaux (ex. 3 % dépôt, 2,8 % retrait) sont des
// hypothèses à valider : ils ne s'appliquent que si une règle active est enregistrée.

const SPECIFICITY = ['country', 'provider', 'method', 'currency'];

export function createFeeEngine({ db }) {
  async function findRule({ txType, country, provider, method, currency }) {
    const rules = await db('fee_rules').where({ tx_type: txType, active: true });
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
      if (ok && score > bestScore) {
        best = r;
        bestScore = score;
      }
    }
    return best;
  }

  // Frais arrondis à l'unité mineure supérieure (jamais de sous-facturation cachée).
  function compute(rule, principalMinor) {
    if (!rule) return 0;
    return Math.ceil((principalMinor * rule.pct_bp) / 10000) + Number(rule.fixed_minor || 0);
  }

  return {
    // Cotisation : les frais s'ajoutent au montant payé par le membre.
    async quoteContribution({ principalMinor, currency, country, provider, method }) {
      const rule = await findRule({ txType: 'contribution', country, provider, method, currency });
      const fee = compute(rule, principalMinor);
      return { principalMinor, feeMinor: fee, totalMinor: principalMinor + fee, netToPoolMinor: principalMinor, ruleId: rule?.id ?? null };
    },
    // Versement : les frais sont déduits de la cagnotte versée.
    async quotePayout({ grossMinor, currency, country, provider, method }) {
      const rule = await findRule({ txType: 'payout', country, provider, method, currency });
      const fee = Math.min(compute(rule, grossMinor), grossMinor);
      return { grossMinor, feeMinor: fee, netMinor: grossMinor - fee, ruleId: rule?.id ?? null };
    },
    findRule,
  };
}
