"""Pricing settings (contract) — persistent, user-provided.

We store the contract settings in the persistent catalogue under:

- cat["settings"]["pricing"]

Design principles:

- Support both contract types: fixed and HP/HC.
- Store both HT and TTC; never infer VAT.
- Include monthly subscription (abonnement) HT and TTC.
- HP/HC schedule is user-configurable; default 22:00 → 06:00.

Unified API endpoints:

- GET  /api/home_suivi_elec/unified/settings/pricing
- POST /api/home_suivi_elec/unified/settings/pricing

POST body:

- { "pricing": { ... } }  (or you can send the pricing object directly)
- { "clear": true }      (clears settings)

Pricing object shape (v1):

Common fields:

- contract_type: "fixed" | "hphc"
- display_mode: "ttc" | "ht"
- subscription_monthly: { ht: number, ttc: number }

If contract_type == "fixed":

- fixed_energy_per_kwh: { ht: number, ttc: number }

If contract_type == "hphc":

- hp_energy_per_kwh: { ht: number, ttc: number }
- hc_energy_per_kwh: { ht: number, ttc: number }
- hc_schedule: { start: "HH:MM", end: "HH:MM" }

Response:

- { ok: true, pricing: { ... } }
"""
