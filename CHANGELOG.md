# Changelog

## 0.1.9

- Local/cloud mode switching: overflow menu links, editable local URL, Android cloud banner, and remembered local access.
- House snapshot slides on **All on** / **All off** with slide-confirm thumb UI; refined room snapshot gesture and animation.
- App JS split into three File Manager chunks (`mld-app-post2.js`) to stay under hub size limits.
- Light command metering uses `runInMillis`; snapshot timestamps use Hubitat `now()`.

## 0.1.8

- Motorized shades & blinds: device picker, room tiles, quick popup with open/close/pause and drag-to-position.
- Light snapshots: slide-to-save and slide-to-restore per room or whole house.
- Bulk room/house light on/off; configurable metering, on/off optimization, and activation optimization for snapshots.
- Build-time size checks for `mld-app-pre.js` and `mld-sw.js`.

## 0.1.7

- Default dashboard and PWA title renamed to **mDash**.
- HSM quick popup: shield icons for arm/disarm modes and cancel-alert button.
- Fix music master transport and popup close across JS chunks (`postCall`); build-time check for part-1/part-2 symbol leaks.

## 0.1.6

- Documentation pass: community post draft, HPM registry guide, CHANGELOG, NOTICE, bundle READMEs, PWA description, generated `repository.json`, setup page copy.
- Groovy Devices section intro; `communityLink` in HPM manifest (update URL after forum post).

## 0.1.5

- Updated HPM, README, and SmartApp descriptions emphasizing minimal setup, smart device names, PWA, and hub-only hosting.
- Apache 2.0 LICENSE; author and version metadata centralized in `build.mjs`.

## 0.1.4

- HPM asset URLs track `master/dist` for reliable updates.
- README documents custom repository URL and common HPM update pitfalls.

## 0.1.3

- Cross-chunk `postCall` fixes for lock/music optimistic popups and thermostat quick-popup refresh.

## 0.1.2

- Hub mode icons and thermostat popup fixes.

## 0.1.1

- Expanded HPM package description.

## 0.1.0

- Initial public release: room-grouped dashboard, HPM support, PWA assets, File Manager deployment.
