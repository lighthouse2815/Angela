<script setup lang="ts">
import { Stickers } from '@angela/stage-ui/components'
</script>

<template>
  <Stickers />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.stickers.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
