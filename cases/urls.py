from django.urls import path

from . import views

urlpatterns = [
    path('overview/', views.OverviewView.as_view()),
    path('export/', views.ExportView.as_view()),
    path('open/', views.OpenView.as_view()),
    path('by-number/<str:case_number>/', views.CaseByNumberView.as_view()),
    path('', views.CaseListView.as_view()),
    path('<int:pk>/', views.CaseDetailView.as_view()),
    path('<int:pk>/transition/', views.TransitionView.as_view()),
]
