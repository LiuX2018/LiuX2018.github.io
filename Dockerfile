FROM ruby:3.3.5-slim

# uncomment these if you are having this issue with the build:
# /usr/local/bundle/gems/jekyll-4.3.4/lib/jekyll/site.rb:509:in `initialize': Permission denied @ rb_sysopen - /srv/jekyll/.jekyll-cache/.gitignore (Errno::EACCES)
# ARG GROUPID=901
# ARG GROUPNAME=ruby
# ARG USERID=901
# ARG USERNAME=jekyll

ENV DEBIAN_FRONTEND=noninteractive

LABEL authors="Amir Pourmand,George Araújo" \
      description="Docker image for al-folio academic template" \
      maintainer="Amir Pourmand"

# uncomment these if you are having this issue with the build:
# /usr/local/bundle/gems/jekyll-4.3.4/lib/jekyll/site.rb:509:in `initialize': Permission denied @ rb_sysopen - /srv/jekyll/.jekyll-cache/.gitignore (Errno::EACCES)
# add a non-root user to the image with a specific group and user id to avoid permission issues
# RUN groupadd -r $GROUPNAME -g $GROUPID && \
#     useradd -u $USERID -m -g $GROUPNAME $USERNAME

# install system dependencies
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        git \
        imagemagick \
        locales \
        nodejs \
        python3-pip \
        zlib1g-dev && \
    pip --no-cache-dir install --upgrade --break-system-packages nbconvert && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/* /tmp/*

# set the locale
RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && \
    locale-gen

# set environment variables
ENV EXECJS_RUNTIME=Node \
    JEKYLL_ENV=production \
    LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

# create a directory for the jekyll site
RUN mkdir -p /srv/jekyll

# copy the Gemfile and Gemfile.lock to the image
COPY Gemfile.lock Gemfile /srv/jekyll/

# set the working directory
WORKDIR /srv/jekyll

# Install the exact Bundler version recorded in Gemfile.lock, then install the
# locked Jekyll runtime. Jekyll itself must not float independently of the lock.
RUN gem install --no-document bundler -v 4.0.6 && \
    bundle _4.0.6_ install --jobs 4 --retry 3

EXPOSE 8080

COPY --chmod=755 bin/entry_point.sh /usr/local/bin/al-folio-entrypoint

# uncomment this if you are having this issue with the build:
# /usr/local/bundle/gems/jekyll-4.3.4/lib/jekyll/site.rb:509:in `initialize': Permission denied @ rb_sysopen - /srv/jekyll/.jekyll-cache/.gitignore (Errno::EACCES)
# set the ownership of the jekyll site directory to the non-root user
# USER $USERNAME

CMD ["/usr/local/bin/al-folio-entrypoint"]
