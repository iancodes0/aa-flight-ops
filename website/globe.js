(() => {
  const status = document.querySelector('#globe-status');
  const token = window.CESIUM_ION_ACCESS_TOKEN;

  if (!token) {
    status.textContent =
      'Add your Cesium Ion token to website/globe-config.js to load terrain and imagery.';
    return;
  }

  Cesium.Ion.defaultAccessToken = token;

  try {
    const viewer = new Cesium.Viewer('cesiumContainer', {
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      animation: false,
      timeline: false,
      baseLayerPicker: true,
      geocoder: true,
      homeButton: true,
      sceneModePicker: true,
      navigationHelpButton: true,
      fullscreenButton: true
    });

    const aircraftPhysics = new AircraftPhysics({
      position: { x: 0, y: 0, z: 500 },
      velocity: { x: 0, y: 0, z: 0 },
      heading: Math.PI
    });
    const aircraftInputs = {
      pitch: 0,
      roll: 0,
      thrust: 0
    };
    const minimumAltitude = 100;
    const flightAreaRadius = 50_000;
    const controlStep = 0.1;
    const maxPitch = Math.PI / 2;
    const maxRoll = Math.PI / 2;

    window.addEventListener('keydown', (event) => {
      const adjustments = {
        ArrowUp: { property: 'pitch', amount: controlStep },
        ArrowDown: { property: 'pitch', amount: -controlStep },
        ArrowLeft: { property: 'roll', amount: -controlStep },
        ArrowRight: { property: 'roll', amount: controlStep }
      };
      const adjustment = adjustments[event.key];

      if (event.key >= '1' && event.key <= '9') {
        const throttleLevel = Number(event.key);
        aircraftInputs.thrust = 0.1 + ((throttleLevel - 1) / 8) * 0.9;
        event.preventDefault();
        return;
      }

      if (!adjustment) {
        return;
      }

      event.preventDefault();
      const limit = adjustment.property === 'pitch' ? maxPitch : maxRoll;
      aircraftInputs[adjustment.property] = Cesium.Math.clamp(
        aircraftInputs[adjustment.property] + adjustment.amount,
        -limit,
        limit
      );
    });
    const spawnLongitude = -98.5795;
    const spawnLatitude = 39.8283;
    const aircraftAnchor = Cesium.Cartesian3.fromDegrees(
      spawnLongitude,
      spawnLatitude,
      0
    );
    const aircraftFrame = Cesium.Transforms.eastNorthUpToFixedFrame(
      aircraftAnchor
    );
    const aircraftEntity = viewer.entities.add({
      name: 'Physics Aircraft',
      position: aircraftAnchor,
      model: {
        uri: 'models/airplane.glb',
        scale: 1
      }
    });

    let previousTime = viewer.clock.currentTime;
    viewer.clock.shouldAnimate = true;
    viewer.clock.onTick.addEventListener((clock) => {
      const currentTime = clock.currentTime;
      const deltaTime = Cesium.JulianDate.secondsDifference(
        currentTime,
        previousTime
      );
      previousTime = currentTime;

      if (deltaTime <= 0 || deltaTime > 1) {
        return;
      }
      const state = aircraftPhysics.update(deltaTime, aircraftInputs);
      const horizontalDistance = Math.hypot(
        state.position.x,
        state.position.y
      );
      if (horizontalDistance > flightAreaRadius) {
        aircraftPhysics.reset({
          position: { x: 0, y: 0, z: minimumAltitude },
          velocity: { x: 0, y: 0, z: 0 }
        });
        aircraftInputs.pitch = 0;
        aircraftInputs.roll = 0;
        status.textContent =
          'Flight area limit reached. Aircraft returned to the runway.';
        return;
      }
      if (state.position.z < minimumAltitude) {
        state.position.z = minimumAltitude;
        aircraftPhysics.position.z = minimumAltitude;
        if (aircraftPhysics.velocity.z < 0) {
          aircraftPhysics.velocity.z = 0;
        }
      }
      const localPosition = new Cesium.Cartesian3(
        state.position.x,
        state.position.y,
        state.position.z
      );
      const worldPosition = Cesium.Matrix4.multiplyByPoint(
        aircraftFrame,
        localPosition,
        new Cesium.Cartesian3()
      );
      const heading = Math.PI / 2 - aircraftPhysics.heading;
      const orientation = Cesium.Transforms.headingPitchRollQuaternion(
        worldPosition,
        new Cesium.HeadingPitchRoll(
          heading,
          aircraftInputs.pitch,
          aircraftInputs.roll
        )
      );

      aircraftEntity.position = worldPosition;
      aircraftEntity.orientation = orientation;
    });

    window.aircraftPhysics = aircraftPhysics;
    window.aircraftInputs = aircraftInputs;
    window.aircraftEntity = aircraftEntity;

    viewer.zoomTo(
      aircraftEntity,
      new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-20), 500)
    ).then(() => {
      viewer.trackedEntity = aircraftEntity;
    }).catch((error) => {
      console.error('Unable to position the camera on the aircraft.', error);
      status.textContent =
        'The aircraft loaded, but the camera could not follow it.';
    });
  } catch (error) {
    console.error('Cesium globe initialization failed.', error);
    status.textContent =
      'The globe could not be initialized. Check the browser console and token permissions.';
  }
})();
