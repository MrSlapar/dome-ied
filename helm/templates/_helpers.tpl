{{/*
Expand the name of the chart.
*/}}
{{- define "dome-ied.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "dome-ied.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "dome-ied.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "dome-ied.labels" -}}
helm.sh/chart: {{ include "dome-ied.chart" . }}
{{ include "dome-ied.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "dome-ied.selectorLabels" -}}
app.kubernetes.io/name: {{ include "dome-ied.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the IED service account to use
*/}}
{{- define "dome-ied.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "dome-ied.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
IED component labels
*/}}
{{- define "dome-ied.ied.labels" -}}
{{ include "dome-ied.labels" . }}
app.kubernetes.io/component: ied
{{- end }}

{{/*
IED selector labels
*/}}
{{- define "dome-ied.ied.selectorLabels" -}}
{{ include "dome-ied.selectorLabels" . }}
app.kubernetes.io/component: ied
{{- end }}

{{/*
Redis component labels
*/}}
{{- define "dome-ied.redis.labels" -}}
{{ include "dome-ied.labels" . }}
app.kubernetes.io/component: redis
{{- end }}

{{/*
Redis selector labels
*/}}
{{- define "dome-ied.redis.selectorLabels" -}}
{{ include "dome-ied.selectorLabels" . }}
app.kubernetes.io/component: redis
{{- end }}

{{/*
Redis fullname
*/}}
{{- define "dome-ied.redis.fullname" -}}
{{- printf "%s-redis" (include "dome-ied.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Redis service name
*/}}
{{- define "dome-ied.redis.serviceName" -}}
{{- include "dome-ied.redis.fullname" . }}
{{- end }}

{{/*
HashNET adapter fullname
*/}}
{{- define "dome-ied.hashnet.fullname" -}}
{{- printf "%s-hashnet" (include "dome-ied.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Alastria adapter fullname
*/}}
{{- define "dome-ied.alastria.fullname" -}}
{{- printf "%s-alastria" (include "dome-ied.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Redis connection URL
*/}}
{{- define "dome-ied.redisUrl" -}}
{{- printf "%s:6379" (include "dome-ied.redis.serviceName" .) }}
{{- end }}

{{/*
IED image
*/}}
{{- define "dome-ied.ied.image" -}}
{{- $tag := .Values.ied.image.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" .Values.ied.image.repository $tag }}
{{- end }}

{{/*
Redis image
*/}}
{{- define "dome-ied.redis.image" -}}
{{- printf "%s:%s" .Values.redis.image.repository .Values.redis.image.tag }}
{{- end }}
