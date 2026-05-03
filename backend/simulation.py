import numpy as np
from scipy import signal

class DelayBuffer:
    """Circular buffer to implement explicit time delays."""
    def __init__(self, delay_samples):
        self.delay = max(0, int(delay_samples))
        self.buffer = np.zeros(self.delay) if self.delay > 0 else np.zeros(1)
        self.ptr = 0

    def push_pop(self, val):
        if self.delay == 0:
            return val
        out_val = self.buffer[self.ptr]
        self.buffer[self.ptr] = val
        self.ptr = (self.ptr + 1) % self.delay
        return out_val

class StateSpacePlant:
    """Exact state-space discretization of P(s) = K / ((s+a)(s+b))"""
    def __init__(self, K, a, b, dt):
        self.dt = dt
        # Continuous state-space matrices for 1 / (s^2 + (a+b)s + ab)
        A_c = np.array([[0, 1], [-a*b, -(a+b)]])
        B_c = np.array([[0], [K]])
        C_c = np.array([[1, 0]])
        D_c = np.array([[0]])
        
        # Exact discretization using Matrix Exponential (ZOH)
        sys_d = signal.cont2discrete((A_c, B_c, C_c, D_c), dt, method='zoh')
        self.A, self.B, self.C, self.D = sys_d[0], sys_d[1], sys_d[2], sys_d[3]
        
        # State vector
        self.x = np.zeros((2, 1))

    def step(self, u):
        # We compute y(n) before x(n+1)
        y = self.C @ self.x + self.D * u
        self.x = self.A @ self.x + self.B * u
        return float(y[0, 0])

def get_secondary_path_ir(plant, delay_buffer, length):
    """
    Generates the impulse response inherently including the explicit delay
    by passing a unit impulse through the combined delay + state-space system.
    """
    ir = np.zeros(length)
    
    # Save current states to restore them later
    saved_x = plant.x.copy()
    saved_ptr = delay_buffer.ptr
    saved_buffer = delay_buffer.buffer.copy()
    
    # Reset states for IR generation
    plant.x = np.zeros((2, 1))
    delay_buffer.buffer = np.zeros_like(delay_buffer.buffer)
    delay_buffer.ptr = 0
    
    # Excite with unit impulse
    ir[0] = plant.step(delay_buffer.push_pop(1.0))
    for i in range(1, length):
        ir[i] = plant.step(delay_buffer.push_pop(0.0))
        
    # Restore states
    plant.x = saved_x
    delay_buffer.ptr = saved_ptr
    delay_buffer.buffer = saved_buffer
    
    return ir

class EnhancedPID:
    def __init__(self, Kp, Ki, Kd, dt, output_limits=(-10.0, 10.0), N_filter=10.0):
        self.Kp = Kp
        self.Ki = Ki
        self.Kd = Kd
        self.dt = dt
        self.min_u, self.max_u = output_limits
        self.N = N_filter
        
        self.I = 0.0
        self.prev_e = 0.0
        self.prev_D = 0.0

    def compute(self, e):
        P = self.Kp * e
        
        # Tentative Integral (for Anti-Windup)
        I_tentative = self.I + self.Ki * e * self.dt
        
        # Filtered Derivative
        a = 1.0 / (1.0 + self.N * self.dt)
        D = a * self.prev_D + self.Kd * self.N * a * (e - self.prev_e)
        
        u = P + I_tentative + D
        
        # Clamping
        u_clamped = max(self.min_u, min(self.max_u, u))
        
        # Anti-Windup Conditional Integration
        if u == u_clamped or (u > self.max_u and e < 0) or (u < self.min_u and e > 0):
            self.I = I_tentative
            
        self.prev_e = e
        self.prev_D = D
        return u_clamped

def run_simulation(params):
    dt = 1.0 / params['fs']
    n_steps = int(params['duration'] * params['fs'])
    
    # ----------------------------------------------------
    # Secondary Path P(s) (Controller to Error Sensor)
    # ----------------------------------------------------
    sec_delay_samples = int(params['delay_T'] / dt)
    plant = StateSpacePlant(params['K'], params['a'], params['b'], dt)
    delay_buffer = DelayBuffer(sec_delay_samples)
    
    # ----------------------------------------------------
    # Disturbance Path P_d(s) (Noise Source to Error Sensor)
    # Modeled independently from the secondary path.
    # ----------------------------------------------------
    dist_K = params.get('dist_K', params['K'] * 1.5)
    dist_a = params.get('dist_a', params['a'] * 0.8)
    dist_b = params.get('dist_b', params['b'] * 1.2)
    dist_delay_T = params.get('dist_delay_T', params['delay_T'] + 0.01)
    
    dist_delay_samples = int(dist_delay_T / dt)
    dist_plant = StateSpacePlant(dist_K, dist_a, dist_b, dt)
    dist_delay_buffer = DelayBuffer(dist_delay_samples)
    
    # Generate input signal x(n)
    t = np.arange(n_steps) * dt
    f0 = params['dist_freq']
    x_n = np.sin(2 * np.pi * f0 * t) + np.random.normal(0, params['noise_amp'], n_steps)
    
    # Controllers setup
    pid = EnhancedPID(params['Kp'], params['Ki'], params['Kd'], dt)
    
    # FxLMS Setup
    M = params['filter_length']
    w = np.zeros(M)
    x_history = np.zeros(M)
    xf_history = np.zeros(M)
    
    # Generate true secondary path impulse response natively including the delay
    h_sec = get_secondary_path_ir(plant, delay_buffer, M)
    
    # Result arrays
    d_out = np.zeros(n_steps)
    e_out = np.zeros(n_steps)
    u_out = np.zeros(n_steps)
    pid_out_arr = np.zeros(n_steps)
    adapt_out_arr = np.zeros(n_steps)
    
    ctrl_type = params['controller_type']
    
    for n in range(n_steps):
        # 1. Disturbance path evaluation
        delayed_x_dist = dist_delay_buffer.push_pop(x_n[n])
        d_n = dist_plant.step(delayed_x_dist)
        d_out[n] = d_n
        
        # 2. Timing Consistency & Causality: e(n) = d(n) + y(n)
        # Because D=0, y(n) depends only on the current state x(n), which encapsulates all past inputs.
        # We read y(n) before stepping the plant with the new u(n).
        y_n = float((plant.C @ plant.x)[0, 0])
        e_n = d_n + y_n
        e_out[n] = e_n
        
        # 3. FxLMS computations
        # Update histories
        x_history[1:] = x_history[:-1]
        x_history[0] = x_n[n]
        
        # Compute strictly causal filtered reference x_f(n)
        x_f_n = np.dot(h_sec, x_history)
        xf_history[1:] = xf_history[:-1]
        xf_history[0] = x_f_n
        
        u_pid = 0.0
        u_adapt = 0.0
        
        # 4. Controllers compute u(n) based on e(n)
        if ctrl_type in ['PID', 'Hybrid']:
            u_pid = pid.compute(e_n)
            
        if ctrl_type in ['FxLMS', 'Hybrid']:
            u_adapt = np.dot(w, x_history)
            
            # Stable Leaky LMS Weight update
            mu = params['mu_0'] / (params['epsilon'] + np.dot(xf_history, xf_history))
            
            # Safety mechanism: Limit maximum step size to prevent explosion due to low plant gain
            mu = min(mu, 0.5)
            
            w = (1 - params['gamma']) * w - mu * e_n * xf_history
            
            # Safety mechanism: Limit adaptive weights to prevent runaway growth
            w = np.clip(w, -50.0, 50.0)
            
        u_n = u_pid + u_adapt
        
        # Safety mechanism: Clip total control signal within a reasonable range
        u_n = np.clip(u_n, -50.0, 50.0)
        
        pid_out_arr[n] = u_pid
        adapt_out_arr[n] = u_adapt
        u_out[n] = u_n
        
        # 5. Step the secondary path plant with new u(n) for the NEXT iteration
        delayed_u = delay_buffer.push_pop(u_n)
        plant.step(delayed_u)
        
        # Debug logging for the first 5 steps
        if params.get('debug') and 15 <= n < 20:
            print(f"--- Step {n} ---")
            print(f"State Evolution [x(n)]: {plant.x.flatten().tolist()}")
            print(f"Delay Buffer [d_n]: {d_n:.6f}, [delayed_u]: {delayed_u:.6f}")
            print(f"Error Signal [e(n) = d(n) + y(n)]: {e_n:.6f} = {d_n:.6f} + {y_n:.6f}")
            print(f"Filtered Reference [x_f(n)]: {x_f_n:.6f}")
            print(f"Weight Norm [||w(n)||]: {np.linalg.norm(w):.6f}")
            print(f"Control Signals [u_PID, u_adapt, u_total]: {u_pid:.6f}, {u_adapt:.6f}, {u_n:.6f}")

    # Correct Noise Reduction Metric: 10 * log10( var(d) / var(e) )
    var_d = np.var(d_out) + 1e-10
    var_e = np.var(e_out) + 1e-10
    nr_db = 10 * np.log10(var_d / var_e)
    
    if params.get('debug'):
        print(f"--- Final Metrics ---")
        print(f"Variance of d(n): {var_d:.6f}")
        print(f"Variance of e(n): {var_e:.6f}")
        print(f"Noise Reduction (dB): {nr_db:.4f}")
    
    return {
        "time": t.tolist(),
        "disturbance": d_out.tolist(),
        "residual": e_out.tolist(),
        "control_signal": u_out.tolist(),
        "pid_component": pid_out_arr.tolist(),
        "adapt_component": adapt_out_arr.tolist(),
        "metrics": {
            "noise_reduction_db": nr_db,
            "final_weight_norm": np.linalg.norm(w)
        }
    }
