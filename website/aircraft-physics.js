(() => {
  const DEFAULTS = {
    mass: 10_000,
    maxThrust: 150_000,
    dragCoefficient: 0.02,
    gravity: 9.80665,
    heading: 0
  };

  class AircraftPhysics {
    constructor(options = {}) {
      const settings = { ...DEFAULTS, ...options };
      this._validatePositive(settings.mass, 'mass');
      this._validatePositive(settings.maxThrust, 'maxThrust');
      this._validateNonNegative(settings.dragCoefficient, 'dragCoefficient');
      this._validatePositive(settings.gravity, 'gravity');
      this._validateNumber(settings.heading, 'heading');

      this.mass = settings.mass;
      this.maxThrust = settings.maxThrust;
      this.dragCoefficient = settings.dragCoefficient;
      this.gravity = settings.gravity;
      this.heading = settings.heading;
      this.position = this._vector(options.position ?? { x: 0, y: 0, z: 0 });
      this.velocity = this._vector(options.velocity ?? { x: 0, y: 0, z: 0 });
    }

    update(deltaTime, { pitch = 0, roll = 0, thrust = 0 } = {}) {
      this._validatePositive(deltaTime, 'deltaTime');
      this._validateNumber(pitch, 'pitch');
      this._validateNumber(roll, 'roll');
      this._validateNumber(thrust, 'thrust');

      const thrustRatio = Math.max(0, Math.min(1, thrust));
      const thrustForce = this._thrustDirection(pitch, roll);
      const speed = this._magnitude(this.velocity);
      const dragForce = {
        x: -this.velocity.x * speed * this.dragCoefficient,
        y: -this.velocity.y * speed * this.dragCoefficient,
        z: -this.velocity.z * speed * this.dragCoefficient
      };
      const acceleration = {
        x: (thrustForce.x * this.maxThrust * thrustRatio + dragForce.x) / this.mass,
        y: (thrustForce.y * this.maxThrust * thrustRatio + dragForce.y) / this.mass,
        z: (thrustForce.z * this.maxThrust * thrustRatio + dragForce.z) / this.mass - this.gravity
      };

      this.velocity.x += acceleration.x * deltaTime;
      this.velocity.y += acceleration.y * deltaTime;
      this.velocity.z += acceleration.z * deltaTime;
      this.position.x += this.velocity.x * deltaTime;
      this.position.y += this.velocity.y * deltaTime;
      this.position.z += this.velocity.z * deltaTime;

      return this.state;
    }

    get state() {
      return {
        position: { ...this.position },
        velocity: { ...this.velocity }
      };
    }

    reset({ position = { x: 0, y: 0, z: 0 }, velocity = { x: 0, y: 0, z: 0 } } = {}) {
      this.position = this._vector(position);
      this.velocity = this._vector(velocity);
      return this.state;
    }

    _thrustDirection(pitch, roll) {
      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);
      const cosRoll = Math.cos(roll);
      const sinRoll = Math.sin(roll);
      const forward = {
        x: cosPitch * Math.cos(this.heading),
        y: cosPitch * Math.sin(this.heading),
        z: sinPitch
      };
      const right = {
        x: -Math.sin(this.heading),
        y: Math.cos(this.heading),
        z: 0
      };
      const up = {
        x: -sinPitch * Math.cos(this.heading),
        y: -sinPitch * Math.sin(this.heading),
        z: cosPitch
      };
      return {
        x: forward.x * cosRoll + right.x * sinRoll,
        y: forward.y * cosRoll + right.y * sinRoll,
        z: forward.z * cosRoll + right.z * sinRoll
      };
    }

    _vector(value) {
      if (!value || typeof value !== 'object') {
        throw new TypeError('Position and velocity must be vector objects.');
      }
      return {
        x: this._validateNumber(value.x ?? 0, 'vector.x'),
        y: this._validateNumber(value.y ?? 0, 'vector.y'),
        z: this._validateNumber(value.z ?? 0, 'vector.z')
      };
    }

    _magnitude(vector) {
      return Math.hypot(vector.x, vector.y, vector.z);
    }

    _validateNumber(value, name) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number.`);
      }
      return value;
    }

    _validatePositive(value, name) {
      this._validateNumber(value, name);
      if (value <= 0) {
        throw new RangeError(`${name} must be greater than zero.`);
      }
    }

    _validateNonNegative(value, name) {
      this._validateNumber(value, name);
      if (value < 0) {
        throw new RangeError(`${name} must not be negative.`);
      }
    }
  }

  window.AircraftPhysics = AircraftPhysics;
})();
