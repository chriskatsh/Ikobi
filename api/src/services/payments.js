// Orchestrateur de paiement : choisit le fournisseur selon le pays et l'opérateur.
// Ajouter un fournisseur (AWA Network, un agrégateur au Gabon…) = écrire un adaptateur
// exposant debit / credit / verify / parseCallback, puis l'enregistrer ici.
// Aucun fournisseur n'est simulé en production : sans adaptateur configuré, l'opération échoue.

import { badRequest } from '../lib/errors.js';

// Route par défaut : RDC → AWA Network pour les 4 opérateurs. Gabon : aucun fournisseur tant qu'un
// accord n'est pas signé (ne pas supposer qu'AWA couvre la CEMAC).
const DEFAULT_ROUTES = {
  CD: { mpesa: 'awa', orange: 'awa', airtel: 'awa', africell: 'awa' },
  GA: {},
};

// Devises acceptées par fournisseur (doc AWA : CDF uniquement).
const DEFAULT_CURRENCIES = { awa: ['CDF'] };

export function createPaymentOrchestrator({ providers, routes = DEFAULT_ROUTES, currencies = DEFAULT_CURRENCIES }) {
  const currenciesOf = (name) => providers[name]?.currencies || currencies[name] || [];
  return {
    providers,
    route(country, method, currency) {
      const name = routes[country]?.[method];
      if (!name || !providers[name]) {
        throw badRequest('provider_unavailable', `Paiement ${method} indisponible pour ce pays pour le moment`);
      }
      if (currency && !currenciesOf(name).includes(currency)) {
        throw badRequest('currency_unavailable', `Les paiements en ${currency} ne sont pas encore disponibles`);
      }
      return { name, client: providers[name] };
    },
    supportedCurrencies(country) {
      const names = new Set(Object.values(routes[country] || {}).filter((n) => providers[n]));
      const out = new Set();
      for (const n of names) for (const c of currenciesOf(n)) out.add(c);
      return [...out];
    },
    get(name) {
      const p = providers[name];
      if (!p) throw new Error(`Fournisseur de paiement inconnu : ${name}`);
      return p;
    },
    supportedMethods(country) {
      return Object.entries(routes[country] || {}).filter(([, p]) => providers[p]).map(([m]) => m);
    },
  };
}
