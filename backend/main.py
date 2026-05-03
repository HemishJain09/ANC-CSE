from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from simulation import run_simulation

app = FastAPI()

# Allow frontend connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SimulationParams(BaseModel):
    fs: float = 2000.0
    duration: float = 2.0
    
    # Plant & Disturbance (P(s))
    K: float = 1000.0
    a: float = 50.0
    b: float = 200.0
    delay_T: float = 0.005
    
    # Input signal x(n)
    dist_freq: float = 20.0
    noise_amp: float = 0.05
    
    # Controllers
    controller_type: str = "Hybrid" # 'PID', 'FxLMS', or 'Hybrid'
    
    # PID params
    Kp: float = -1.5
    Ki: float = -40.0
    Kd: float = -0.001
    
    # FxLMS params
    filter_length: int = 64
    mu_0: float = 0.5
    gamma: float = 0.0001
    epsilon: float = 1e-6

@app.post("/simulate")
def simulate_anc(params: SimulationParams):
    results = run_simulation(params.model_dump())
    return results

if __name__ == "__main__":
    uvicorn.run(app, host='0.0.0.0', port=8001)
