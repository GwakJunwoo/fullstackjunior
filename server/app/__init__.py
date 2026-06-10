from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers.base import router as base_router
from .routers.supply import router as supply_router
from .routers.rates import router as rates_router
from .routers.ktb import router as ktb_router
from .routers.beta import router as beta_router
from .routers.rv_position import router as rv_position_router
from .routers.quant_house import router as quant_house_router
from .routers.qh_ops import router as qh_ops_router


def create_app() -> FastAPI:
    app = FastAPI(title="scon API", version="0.4.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["*"],
    )

    app.include_router(base_router)
    app.include_router(supply_router)
    app.include_router(rates_router)
    app.include_router(ktb_router)
    app.include_router(beta_router)
    app.include_router(rv_position_router)
    app.include_router(quant_house_router)
    app.include_router(qh_ops_router)

    return app
