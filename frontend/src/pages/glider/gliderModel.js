import {copyText as siteText} from "../../content/systemText.js";
const STATE_META = {
  ok: { color: 'green', label: siteText("site.dba91f0527625a95") },
  landed: { color: 'blue', label: siteText("site.ad67c837db159790") },
  hard_landing: { color: 'orange', label: siteText("site.14b3b523144b7619") },
  'crashed(roll)': { color: 'red', label: siteText("site.8943530a08771937") },
  'stalled/slow': { color: 'orange', label: siteText("site.612840ec62b28691") },
  timedout: { color: 'default', label: siteText("site.8da676dfbfd767ce") },
};

export const STATE_TIPS = {
  ok: siteText("site.09aaa2ea79fc4be3"),
  landed: siteText("site.7cb2b95fd9c16af0"),
  hard_landing: siteText("site.075eeed51b9a25aa"),
  'crashed(roll)': siteText("site.446efa702ecc3f53"),
  'stalled/slow': siteText("site.43feb7d63bd09975"),
  timedout: siteText("site.e8262705b1a610ab"),
};

export function stateMeta(state) {
  return STATE_META[state] || { color: 'default', label: state || '—' };
}

export const flightParameters = [
  { name: 'dihedral', field: 'dihedral_deg', title: siteText("site.6fc72c1ad447b09f"), label: siteText("site.bad404f95956e3bf"), unit: '°', initial: 5, min: 0, max: 15, step: 0.5, required: true, extra: siteText("site.0d76797ecd8be9c3") },
  { name: 'cg', field: 'cg_x', title: siteText("site.314a07f0a3576716"), label: siteText("site.7ebb1792970c7722"), unit: 'm', initial: 0, min: -1.5, max: 1.5, step: 0.1, required: true, extra: siteText("site.499ded0dcf84a86e") },
  { name: 'speed', field: 'speed', title: siteText("site.477eb71ac396a1cf"), label: siteText("site.07736446459ac5f8"), unit: 'm/s', initial: 36, min: 15, max: 60, step: 1, required: true, extra: siteText("site.8d6a0307e7d5beb3") },
  { name: 'wing_area', field: 'wing_area', title: siteText("site.6b89973dae6b89d8"), label: siteText("site.b6e2c2d81e558d25"), unit: 'm²', initial: 17.5, min: 10, max: 30, step: 0.5, extra: siteText("site.514cedd9e4eb4e34") },
  { name: 'mass', field: 'mass', title: siteText("site.95b9479e1d59d024"), label: siteText("site.8e2a5457395e14fd"), unit: 'kg', initial: 420, min: 250, max: 700, step: 10, extra: siteText("site.f3fab274b48c61d5") },
  { name: 'elevator', field: 'elevator_deg', title: siteText("site.b6caa2c89a472a9d"), label: siteText("site.53ba6e9f82b5acce"), unit: '°', initial: 0, min: -15, max: 15, step: 0.5, extra: siteText("site.a90badf45b7bef4d") },
  { name: 'rudder', field: 'rudder_deg', title: siteText("site.ef6ee0ed57525fd6"), label: siteText("site.c9d5875c7240f7f1"), unit: '°', initial: 0, min: -15, max: 15, step: 0.5, extra: siteText("site.4a1c8db7799c4e10") },
];
export const initialFlightParameters = Object.fromEntries(flightParameters.map((parameter) => [parameter.name, parameter.initial]));
export function flightMetrics(record) {
  return [
    [siteText("site.fee946981402170d"), record.glide_time_s, 's'], [siteText("site.7247f908d1ee4fe4"), record.result?.distance_m, 'm'],
    [siteText("site.b8fa7fbbfbd7a0c7"), record.result?.glide_ratio, ''], [siteText("site.5ddf4a1db01ecc72"), record.result?.mean_sink_mps, 'm/s'],
    [siteText("site.b3f9e88cc2248cec"), record.result?.mean_speed_mps, 'm/s'], [siteText("site.2e7ccbb831159c5c"), record.result?.alt_end, 'm'],
  ].map(([label, value, unit]) => ({ label, value: value ?? '—', unit }));
}
