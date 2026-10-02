size:
      options.size ||
      (options.speed === 'expedited'
        ? 'expedited'
        : options.speed === 'standard'
          ? 'standard'
          : product.scheduleLabel ||
            (Array.isArray(product.sizes) && product.sizes.length ? product.sizes[0] : null)),