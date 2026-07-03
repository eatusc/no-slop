from django.urls import path

from .views import DeslopView

urlpatterns = [
    path("deslop/", DeslopView.as_view(), name="deslop"),
]
